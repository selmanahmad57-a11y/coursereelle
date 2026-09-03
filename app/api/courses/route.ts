/**
 * Soumission d'une course : le pipeline complet, en une seule requête.
 *
 * Le dossier prévoyait deux points d'entrée, un pour la capture et un pour la
 * course. Tout se fait ici en un envoi multipart, pour une raison concrète :
 * deux requêtes séparées laissent des captures orphelines dans le stockage dès
 * qu'un livreur abandonne entre les deux. Ici, la capture n'est déposée qu'une
 * fois tous les filtres franchis, et elle est retirée si l'écriture en base
 * échoue.
 *
 * Ordre des contrôles, du moins coûteux au plus coûteux :
 *   1. Turnstile, côté serveur — le contrôle du navigateur ne protège rien.
 *   2. Les champs, contre les vocabulaires de la configuration.
 *   3. Le contenant de la capture : type et taille.
 *   4. Anti-fraude : pause en cours, limites de débit.
 *   5. Filtre 1 : cohérence physique.
 *   6. Empreintes, puis contrôles d'authenticité.
 *   7. Dépôt de la capture, puis écriture.
 *
 * Le filtre 2 (lecture automatique de la capture) n'est pas encore branché.
 * Une course qui franchit tout le reste est donc enregistrée « en attente de
 * lecture », jamais « validée » : revendiquer une vérification qui n'a pas eu
 * lieu serait exactement ce que ce site reproche aux plateformes.
 */

import captures from "@/config/captures.json";
import { db } from "@/lib/db.ts";
import {
  compterSoumission,
  etatsAppareil,
  purgerEmpreintes,
  seauxRecents,
  selsRetenus,
} from "@/lib/anti-fraude-db.ts";
import { empreinteAppariee, empreinteExacte, imageLisible, metadonneesProvenance } from "@/lib/image.ts";
import {
  contraintesCapture,
  limitesAntiFraude,
  listeVilles,
  reglesAuthenticite,
  retentionEmpreintesJours,
  seuilsPhysiques,
  zoneDeLaVille,
} from "@/lib/parametres";
import { plateformes, vehicules } from "@/lib/enumerations";
import { controlerAuthenticite } from "@/lib/validation/authenticite.ts";
import { controlerCapture } from "@/lib/validation/capture.ts";
import { empreintesCandidates, evaluerSoumission } from "@/lib/validation/anti-fraude.ts";
import { controlerCoherencePhysique } from "@/lib/validation/regles-physiques.ts";
import { analyserSoumissionCourse } from "@/lib/validation/soumission.ts";
import { VILLE_AUTRE } from "@/lib/contexte-livreur.ts";
import { verifierTurnstile } from "@/lib/turnstile.ts";
import { deposerCapture, supprimerCapture } from "@/lib/r2.ts";

export const runtime = "nodejs";

/** Nombre d'empreintes récentes comparées à la capture proposée. */
const EMPREINTES_COMPAREES = 5000;

const HEURES_ANALYSEES = 24;
const MILLISECONDES_PAR_HEURE = 3_600_000;

const reponse = (corps: Record<string, unknown>, code: number) =>
  Response.json(corps, { status: code });

/**
 * L'adresse ne sert qu'à calculer une empreinte salée, et n'est jamais écrite.
 * En local, aucun en-tête n'est présent : toutes les soumissions partagent alors
 * la même empreinte, ce qui est sans conséquence.
 */
const adresseCliente = (entetes: Headers): string =>
  entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  entetes.get("x-real-ip")?.trim() ??
  "";

const texte = (formulaire: FormData, nom: string): string | undefined => {
  const valeur = formulaire.get(nom);
  return typeof valeur === "string" ? valeur : undefined;
};

export async function POST(requete: Request) {
  const maintenant = new Date();
  const date = maintenant.toISOString().slice(0, 10);
  const adresse = adresseCliente(requete.headers);

  let formulaire: FormData;
  try {
    formulaire = await requete.formData();
  } catch {
    return reponse({ statut: "rejetee_auto", motif: "requete_illisible" }, 400);
  }

  /* 1. Turnstile ------------------------------------------------------- */

  const turnstile = await verifierTurnstile(
    texte(formulaire, "cf-turnstile-response") ?? null,
    adresse || null
  );

  if (!turnstile.valide) {
    return reponse(
      { statut: "rejetee_auto", motif: "turnstile", details: turnstile.erreurs },
      403
    );
  }

  /* 2. Les champs ------------------------------------------------------ */

  const analyse = analyserSoumissionCourse(
    {
      date_course: texte(formulaire, "date_course"),
      plateforme: texte(formulaire, "plateforme"),
      vehicule: texte(formulaire, "vehicule"),
      ville: texte(formulaire, "ville"),
      ville_libre: texte(formulaire, "ville_libre"),
      distance_km: texte(formulaire, "distance_km"),
      prix_paye_euros: texte(formulaire, "prix_paye_euros"),
      pourboire_euros: texte(formulaire, "pourboire_euros"),
      duree_estimee_minutes: texte(formulaire, "duree_estimee_minutes"),
      duree_reelle_minutes: texte(formulaire, "duree_reelle_minutes"),
    },
    {
      plateformes: plateformes.map((option) => option.valeur),
      vehicules: vehicules.map((option) => option.valeur),
      villes: listeVilles.map((ville) => ville.slug),
      villeAutre: VILLE_AUTRE,
    }
  );

  if (analyse.course === null) {
    return reponse({ statut: "rejetee_auto", motif: "champs", details: analyse.erreurs }, 400);
  }

  const course = analyse.course;

  /* 3. Le contenant de la capture -------------------------------------- */

  const fichier = formulaire.get("capture");

  if (!(fichier instanceof File)) {
    return reponse({ statut: "rejetee_auto", motif: "aucun_fichier" }, 400);
  }

  const refusCapture = controlerCapture(
    { type: fichier.type, nom: fichier.name, taille: fichier.size },
    contraintesCapture(course.dateCourse)
  );

  if (refusCapture !== null) {
    return reponse({ statut: "rejetee_auto", motif: refusCapture.motif }, 400);
  }

  /* 4. Anti-fraude ------------------------------------------------------ */

  const retention = retentionEmpreintesJours(date);

  if (retention === null) {
    /* Sans fenetre de retention connue, on ne sait pas quand supprimer les sels :
       mieux vaut refuser que de conserver des empreintes indefiniment. */
    return reponse({ statut: "rejetee_auto", motif: "retention_non_configuree" }, 503);
  }

  const sels = await selsRetenus(maintenant, retention);
  const empreintes = await empreintesCandidates(adresse, sels);

  const decision = evaluerSoumission({
    empreintes,
    seaux: await seauxRecents(
      empreintes,
      new Date(maintenant.getTime() - HEURES_ANALYSEES * MILLISECONDES_PAR_HEURE)
    ),
    etats: await etatsAppareil(empreintes),
    maintenant: maintenant.toISOString(),
    limites: limitesAntiFraude(date),
  });

  if (!decision.autorise) {
    return reponse({ statut: "rejetee_auto", motif: decision.motif }, 429);
  }

  /* 5. Filtre 1 : cohérence physique ------------------------------------ */

  const anomalies = controlerCoherencePhysique(
    { distanceKm: course.distanceKm, dureeReelleMinutes: course.dureeReelleMinutes },
    seuilsPhysiques(course.dateCourse, course.vehicule)
  );

  const sql = db();
  const zone = course.villeSlug === null ? null : zoneDeLaVille(course.villeSlug);

  const enregistrerRejet = async (motif: string, filtre: number) => {
    const [ligne] = (await sql`
      insert into courses (
        date_course, ville_slug, zone, plateforme, vehicule,
        distance_km, prix_paye_euros, pourboire_euros,
        duree_estimee_minutes, duree_reelle_minutes,
        statut, motif_rejet, filtre_rejet
      ) values (
        ${course.dateCourse}, ${course.villeSlug}, ${zone}, ${course.plateforme}, ${course.vehicule},
        ${course.distanceKm}, ${course.prixPayeEuros}, ${course.pourboireEuros},
        ${course.dureeEstimeeMinutes}, ${course.dureeReelleMinutes},
        'rejetee_auto', ${motif}, ${filtre}
      ) returning id
    `) as { id: string }[];

    await compterSoumission(empreintes[0], maintenant);
    return ligne.id;
  };

  if (anomalies.length > 0) {
    const identifiant = await enregistrerRejet(
      anomalies.map((anomalie) => anomalie.code).join(","),
      1
    );
    return reponse(
      { statut: "rejetee_auto", motif: "coherence_physique", anomalies, id: identifiant },
      200
    );
  }

  /* 6. Empreintes et authenticité --------------------------------------- */

  const donnees = new Uint8Array(await fichier.arrayBuffer());

  if (!(await imageLisible(donnees))) {
    const identifiant = await enregistrerRejet("capture_illisible", 2);
    return reponse({ statut: "rejetee_auto", motif: "capture_illisible", id: identifiant }, 200);
  }

  const [hashExact, phash, metadonnees] = await Promise.all([
    empreinteExacte(donnees),
    empreinteAppariee(donnees),
    metadonneesProvenance(donnees),
  ]);

  const connues = (await sql`
    select capture_phash from courses
    where capture_phash is not null
    order by soumise_le desc
    limit ${EMPREINTES_COMPAREES}
  `) as { capture_phash: string }[];

  const authenticite = controlerAuthenticite(
    {
      metadonnees,
      empreinte: phash,
      empreintesConnues: connues.map((ligne) => ligne.capture_phash),
      plateforme: course.plateforme,
      textes: [],
    },
    reglesAuthenticite(course.dateCourse)
  );

  if (authenticite.refus !== null) {
    const identifiant = await enregistrerRejet(authenticite.refus.motif, 3);
    return reponse(
      { statut: "rejetee_auto", motif: authenticite.refus.motif, id: identifiant },
      200
    );
  }

  /* 7. Dépôt puis écriture ---------------------------------------------- */

  const extension =
    captures.formats_acceptes.find((format) => format.type_mime === fichier.type)
      ?.extensions[0] ?? "";
  const cleR2 = `captures/${course.dateCourse}/${hashExact}${extension}`;

  await deposerCapture(cleR2, donnees, fichier.type);

  try {
    const [ligne] = (await sql`
      insert into courses (
        date_course, ville_slug, zone, plateforme, vehicule,
        distance_km, prix_paye_euros, pourboire_euros,
        duree_estimee_minutes, duree_reelle_minutes,
        capture_cle_r2, capture_hash, capture_phash,
        type_capture, provenance_indice, statut
      ) values (
        ${course.dateCourse}, ${course.villeSlug}, ${zone}, ${course.plateforme}, ${course.vehicule},
        ${course.distanceKm}, ${course.prixPayeEuros}, ${course.pourboireEuros},
        ${course.dureeEstimeeMinutes}, ${course.dureeReelleMinutes},
        ${cleR2}, ${hashExact}, ${phash},
        ${null}, ${null}, 'en_attente_ocr'
      ) returning id
    `) as { id: string }[];

    if (course.villeLibre !== null) {
      await sql`
        insert into villes_saisies_libres (course_id, saisie_brute)
        values (${ligne.id}, ${course.villeLibre})
      `;
    }

    for (const signalement of authenticite.signalements) {
      await sql`
        insert into signalements (course_id, code, valeur, reference)
        values (${ligne.id}, ${signalement.code}, ${signalement.valeur}, ${signalement.reference})
      `;
    }

    await compterSoumission(empreintes[0], maintenant);
    await purgerEmpreintes(maintenant, retention);

    return reponse(
      {
        statut: "en_attente_ocr",
        id: ligne.id,
        signalements: authenticite.signalements,
      },
      201
    );
  } catch (erreur) {
    /* L'écriture a échoué : la capture ne doit pas rester orpheline. */
    await supprimerCapture(cleR2).catch(() => undefined);

    const doublon = String(erreur).includes("capture_hash_unique");

    return reponse(
      { statut: "rejetee_auto", motif: doublon ? "doublon_perceptuel" : "ecriture_impossible" },
      doublon ? 200 : 500
    );
  }
}
