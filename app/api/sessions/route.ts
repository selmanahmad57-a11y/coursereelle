/**
 * Soumission d'une session : le temps connecté, et ce qu'il a rapporté.
 *
 * UNE SESSION N'A PAS DE PREUVE, et c'est assumé. Le temps de connexion
 * n'apparaît sur aucun récapitulatif : aucune capture ne peut le confirmer.
 * Cette donnée est donc déclarative de bout en bout, ce que la page Méthode
 * annonce, et sa fiabilité vient du nombre — médianes, exclusion des aberrantes,
 * seuil de publication — jamais de la vérification d'un envoi isolé.
 *
 * Le pipeline est donc celui des courses moins la capture :
 *   1. Turnstile, côté serveur.
 *   2. Les champs, contre les vocabulaires de la configuration.
 *   3. Anti-fraude : pause en cours, limites de débit.
 *   4. Filtre 1 : cohérence physique de la session.
 *   5. Écriture.
 *
 * Une session validée l'est immédiatement : il n'y a rien à lire plus tard.
 * « validee_auto » ne revendique donc ici aucune vérification de preuve — il dit
 * seulement qu'aucun filtre ne l'a écartée, et la page Méthode le distingue.
 */

import { db } from "@/lib/db.ts";
import {
  etatsAppareil,
  compterSoumission,
  seauxRecents,
  selsRetenus,
} from "@/lib/anti-fraude-db.ts";
import { plateformes, vehicules } from "@/lib/enumerations";
import { listeVilles, limitesAntiFraude, retentionEmpreintesJours, seuilsSession, zoneDeLaVille } from "@/lib/parametres";
import { empreintesCandidates, evaluerSoumission } from "@/lib/validation/anti-fraude.ts";
import { controlerSession } from "@/lib/validation/regles-session.ts";
import { analyserSoumissionSession } from "@/lib/validation/soumission-session.ts";
import { VILLE_AUTRE } from "@/lib/contexte-livreur.ts";
import { verifierTurnstile } from "@/lib/turnstile.ts";

const HEURES_ANALYSEES = 24;
const MILLISECONDES_PAR_HEURE = 3_600_000;

const reponse = (corps: Record<string, unknown>, code: number) =>
  Response.json(corps, { status: code });

/** L'adresse ne sert qu'à calculer une empreinte salée, et n'est jamais écrite. */
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

  const analyse = analyserSoumissionSession(
    {
      date_session: texte(formulaire, "date_session"),
      ville: texte(formulaire, "ville"),
      ville_libre: texte(formulaire, "ville_libre"),
      plateforme: texte(formulaire, "plateforme"),
      vehicule: texte(formulaire, "vehicule"),
      heure_connexion: texte(formulaire, "heure_connexion"),
      heure_deconnexion: texte(formulaire, "heure_deconnexion"),
      nombre_courses: texte(formulaire, "nombre_courses"),
      revenu_total_euros: texte(formulaire, "revenu_total_euros"),
      minutes_en_course: texte(formulaire, "minutes_en_course"),
    },
    {
      plateformes: plateformes.map((option) => option.valeur),
      vehicules: vehicules.map((option) => option.valeur),
      villes: listeVilles.map((ville) => ville.slug),
      villeAutre: VILLE_AUTRE,
    }
  );

  if (analyse.session === null) {
    return reponse(
      { statut: "rejetee_auto", motif: "champs", details: analyse.erreurs },
      400
    );
  }

  const session = analyse.session;

  /* 3. Anti-fraude ------------------------------------------------------ */

  const retention = retentionEmpreintesJours(date);

  if (retention === null) {
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

  /* 4. Filtre 1 : cohérence physique ------------------------------------ */

  const anomalies = controlerSession(
    {
      connexionLe: session.connexionLe,
      deconnexionLe: session.deconnexionLe,
      nombreCourses: session.nombreCourses,
      revenuPlateformeEuros: session.revenuTotalEuros,
      minutesEnCourse: session.minutesEnCourse,
    },
    seuilsSession(session.dateSession)
  );

  /* 5. Écriture --------------------------------------------------------- */

  const sql = db();
  const zone = zoneDeLaVille(session.villeSlug);
  const rejetee = anomalies.length > 0;
  const motif = rejetee ? anomalies.map((anomalie) => anomalie.code).join(",") : null;

  const [ligne] = (await sql`
    insert into sessions (
      date_session, ville_slug, plateforme, vehicule,
      connexion_le, deconnexion_le, nombre_courses, revenu_total_euros,
      temps_en_course_minutes, statut, motif_rejet
    ) values (
      ${session.dateSession}, ${session.villeSlug}, ${session.plateforme}, ${session.vehicule},
      ${session.connexionLe}, ${session.deconnexionLe}, ${session.nombreCourses},
      ${session.revenuTotalEuros}, ${session.minutesEnCourse},
      ${rejetee ? "rejetee_auto" : "validee_auto"}, ${motif}
    ) returning id
  `) as { id: string }[];

  if (session.villeLibre !== null) {
    await sql`
      insert into villes_saisies_libres (session_id, saisie_brute)
      values (${ligne.id}, ${session.villeLibre})
    `;
  }

  await compterSoumission(empreintes[0], maintenant);

  if (rejetee) {
    return reponse(
      { statut: "rejetee_auto", motif, details: anomalies.map((a) => a.code) },
      200
    );
  }

  return reponse({ statut: "validee_auto", zone }, 201);
}
