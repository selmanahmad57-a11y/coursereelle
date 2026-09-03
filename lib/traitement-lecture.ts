/**
 * Filtre 2 — le traitement différé des courses en attente de lecture.
 *
 * L'envoi ne lit pas la capture : il enregistre la course en attente et rend la
 * main. La lecture se fait ici, plus tard. Trois raisons, dont la dernière est
 * décisive : les données de langue se téléchargent au démarrage et le système de
 * fichiers est en lecture seule en serverless ; le moteur pèse quarante-trois
 * mégaoctets ; et surtout, un échec de lecture ne doit jamais faire échouer un
 * envoi par ailleurs valide.
 *
 * CE QUE LA LECTURE PEUT CONCLURE, et rien d'autre :
 *
 *   validee_auto    les chiffres lus concordent avec les chiffres saisis.
 *   rejetee_auto    ils divergent franchement, ou la capture ne se laisse pas
 *                   lire — deux motifs distincts, jamais confondus.
 *
 * Une lecture hésitante ne produit AUCUN des deux verdicts de fond : ni une
 * validation, qui confirmerait au bénéfice du doute, ni une divergence, qui
 * reprocherait au livreur un écart peut-être inventé par le lecteur. Elle
 * produit un échec de lecture, et le livreur renvoie une capture nette.
 *
 * Le texte lu ne sort pas de ce module : seules les valeurs extraites sont
 * écrites, dans des colonnes numériques.
 *
 * Les seuils arrivent en paramètre : ce module doit tourner hors de Next, là où
 * l'alias d'importation de la configuration n'existe pas.
 */

import { db } from "./db.ts";
import {
  lectureConcluante,
  lireCapture as extraireValeurs,
  type ReglesLecture,
} from "./lecture-capture.ts";
import { zonesLues } from "./ocr-tesseract.ts";
import { lireCapture as telechargerCapture } from "./r2.ts";
import {
  CHAMPS_VERIFIES,
  resumerMotif,
  tolerancesEffectives,
  verifierCapture,
  type ChampVerifie,
  type Tolerances,
  type ValeursSaisies,
} from "./validation/ocr.ts";

export interface CourseAlire {
  id: string;
  cleR2: string;
  saisie: ValeursSaisies;
}

export interface Verdict {
  id: string;
  statut: "validee_auto" | "rejetee_auto";
  motif: string | null;
  /** Ce que la lecture a extrait : des nombres, jamais du texte. */
  valeurs: Record<ChampVerifie, number | null>;
  confiances: Record<ChampVerifie, number | null>;
}

export interface ReglesTraitement {
  lecture: ReglesLecture;
  tolerances: Tolerances;
  /** Champs facultatifs : non vérifiés quand le livreur ne les a pas saisis. */
  champsFacultatifs: readonly ChampVerifie[];
  /** Champ que toute capture doit porter : sans lui, rien n'est vérifiable. */
  champIndispensable: ChampVerifie;
}

export const coursesEnAttente = async (limite: number): Promise<CourseAlire[]> => {
  const lignes = (await db()`
    select id, capture_cle_r2, prix_paye_euros, distance_km, duree_estimee_minutes
    from courses
    where statut = 'en_attente_ocr' and capture_cle_r2 is not null
    order by soumise_le
    limit ${limite}
  `) as {
    id: string;
    capture_cle_r2: string;
    prix_paye_euros: string | number;
    distance_km: string | number;
    duree_estimee_minutes: string | number | null;
  }[];

  return lignes.map((ligne) => ({
    id: ligne.id,
    cleR2: ligne.capture_cle_r2,
    saisie: {
      prixEuros: Number(ligne.prix_paye_euros),
      distanceKm: Number(ligne.distance_km),
      dureeEstimeeMinutes:
        ligne.duree_estimee_minutes === null ? null : Number(ligne.duree_estimee_minutes),
    },
  }));
};

/**
 * Les champs qu'on comptait vraiment vérifier. Le prix en fait toujours partie :
 * c'est la valeur probante. Les autres seulement s'ils ont été saisis ET si
 * quelque chose de leur forme figure sur la capture — un écran d'acceptation
 * n'affiche pas de durée, et le lui reprocher serait absurde.
 */
const champsAttendus = (
  lecture: ReturnType<typeof extraireValeurs>,
  saisie: ValeursSaisies,
  regles: ReglesTraitement
): ChampVerifie[] =>
  CHAMPS_VERIFIES.filter((champ) => {
    if (champ === regles.champIndispensable) return true;
    if (saisie[champ] === null) return false;
    return lecture.champs[champ].issue !== "absente";
  });

export const lireUneCourse = async (
  course: CourseAlire,
  regles: ReglesTraitement
): Promise<Verdict> => {
  const image = await telechargerCapture(course.cleR2);
  const zones = await zonesLues(image);

  const lecture = extraireValeurs(CHAMPS_VERIFIES, zones, regles.lecture);

  const valeurs = Object.fromEntries(
    CHAMPS_VERIFIES.map((champ) => [champ, lecture.champs[champ].valeur])
  ) as Record<ChampVerifie, number | null>;

  const confiances = Object.fromEntries(
    CHAMPS_VERIFIES.map((champ) => [champ, lecture.champs[champ].confiance])
  ) as Record<ChampVerifie, number | null>;

  const attendus = champsAttendus(lecture, course.saisie, regles);

  /* Le champ indispensable doit avoir été trouvé : sans prix lu, il n'y a rien
     à confirmer, et valider serait valider sur rien. */
  if (lecture.champs[regles.champIndispensable].issue === "absente") {
    return { id: course.id, statut: "rejetee_auto", motif: "echec_lecture", valeurs, confiances };
  }

  const conclusion = lectureConcluante(lecture, attendus);

  if (!conclusion.concluante) {
    return {
      id: course.id,
      statut: "rejetee_auto",
      motif: conclusion.motif,
      valeurs,
      confiances,
    };
  }

  /* On ne vérifie que ce qu'on a su lire et que le livreur a saisi. */
  const effectives = CHAMPS_VERIFIES.reduce<Tolerances>(
    (acc, champ) => ({ ...acc, [champ]: attendus.includes(champ) ? acc[champ] : null }),
    tolerancesEffectives(regles.tolerances, course.saisie, regles.champsFacultatifs)
  );

  const verdict = verifierCapture(course.saisie, lecture.valeurs, effectives);

  return {
    id: course.id,
    statut: verdict.accepte ? "validee_auto" : "rejetee_auto",
    motif: verdict.accepte ? null : resumerMotif(verdict.divergences),
    valeurs,
    confiances,
  };
};

export const enregistrerVerdict = async (verdict: Verdict): Promise<void> => {
  await db()`
    update courses set
      statut = ${verdict.statut},
      motif_rejet = ${verdict.motif},
      filtre_rejet = ${verdict.statut === "rejetee_auto" ? 2 : null},
      ocr_prix_euros = ${verdict.valeurs.prixEuros},
      ocr_distance_km = ${verdict.valeurs.distanceKm},
      ocr_duree_estimee_minutes = ${verdict.valeurs.dureeEstimeeMinutes},
      verdict_le = now(),
      classee_le = now()
    where id = ${verdict.id}
  `;
};

export const traiterEnAttente = async (
  regles: ReglesTraitement,
  limite: number
): Promise<Verdict[]> => {
  const verdicts: Verdict[] = [];

  for (const course of await coursesEnAttente(limite)) {
    const verdict = await lireUneCourse(course, regles);
    await enregistrerVerdict(verdict);
    verdicts.push(verdict);
  }

  return verdicts;
};
