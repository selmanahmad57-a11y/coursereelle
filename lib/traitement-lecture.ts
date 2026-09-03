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

import { classer, type Classement, type ReglesClassification } from "./classification.ts";
import { enregistrerClassification } from "./classification-db.ts";
import type { ContexteCourse } from "./classification-regles.ts";
import { db } from "./db.ts";
import {
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
  /** La date de la course, et non celle du jour : elle résout les barèmes datés. */
  dateCourse: string;
  contexte: ContexteCourse;
}

export const STATUTS_LECTURE = [
  "verifie",
  "non_verifie_lecture_hesitante",
  "absent_de_la_capture",
  "non_saisi",
] as const;

export type StatutLecture = (typeof STATUTS_LECTURE)[number];

export interface Verdict {
  id: string;
  statut: "validee_auto" | "rejetee_auto";
  motif: string | null;
  /** Ce que la lecture a extrait : des nombres, jamais du texte. */
  valeurs: Record<ChampVerifie, number | null>;
  confiances: Record<ChampVerifie, number | null>;
  /** Ce que la capture a confirmé, champ par champ, et sinon pourquoi. */
  statutsLecture: Record<ChampVerifie, StatutLecture>;
  /** Les catégories de conformité, vides tant que la course n'est pas validée. */
  classements?: Classement[];
}

export interface ReglesTraitement {
  lecture: ReglesLecture;
  tolerances: Tolerances;
  /** Champs facultatifs : non vérifiés quand le livreur ne les a pas saisis. */
  champsFacultatifs: readonly ChampVerifie[];
  /**
   * Champs comparés à un barème. Ils doivent être lus franchement, sinon la
   * course échoue : valider une course « sous la grille kilométrique » avec une
   * distance non vérifiée serait une accusation sans preuve.
   */
  champsProbants: readonly ChampVerifie[];
  /**
   * Les barèmes annoncés auxquels comparer une course validée, résolus à sa
   * date. Une fonction plutôt qu'une table : chaque course a sa date, sa zone et
   * son véhicule, et un lot de courses n'a pas de barème commun.
   */
  reglesClassification: (date: string, contexte: ContexteCourse) => ReglesClassification;
}

export const coursesEnAttente = async (limite: number): Promise<CourseAlire[]> => {
  const lignes = (await db()`
    select id, capture_cle_r2, prix_paye_euros, distance_km, duree_estimee_minutes,
           date_course, plateforme, zone, vehicule
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
    date_course: string | Date;
    plateforme: string;
    zone: string | null;
    vehicule: string;
  }[];

  return lignes.map((ligne) => ({
    id: ligne.id,
    cleR2: ligne.capture_cle_r2,
    dateCourse:
      ligne.date_course instanceof Date
        ? ligne.date_course.toISOString().slice(0, 10)
        : String(ligne.date_course).slice(0, 10),
    contexte: {
      plateforme: ligne.plateforme,
      zone: ligne.zone,
      vehicule: ligne.vehicule,
    },
    saisie: {
      prixEuros: Number(ligne.prix_paye_euros),
      distanceKm: Number(ligne.distance_km),
      dureeEstimeeMinutes:
        ligne.duree_estimee_minutes === null ? null : Number(ligne.duree_estimee_minutes),
    },
  }));
};

/**
 * Ce que la capture a confirmé pour un champ, et sinon pourquoi.
 *
 * Les quatre issues disent des choses différentes, et les confondre reviendrait
 * à faire dépendre un verdict d'un accident : un champ que le livreur n'a pas
 * renseigné, un champ que l'écran n'affiche pas, et un champ que le lecteur n'a
 * pas su lire sont trois situations distinctes — mais aucune des trois n'est une
 * vérification.
 */
const statutDe = (
  issue: "lue" | "absente" | "ambigue" | "peu_sure",
  saisi: number | null
): StatutLecture => {
  if (saisi === null) return "non_saisi";
  if (issue === "absente") return "absent_de_la_capture";
  if (issue === "lue") return "verifie";
  return "non_verifie_lecture_hesitante";
};

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

  const statutsLecture = Object.fromEntries(
    CHAMPS_VERIFIES.map((champ) => [
      champ,
      statutDe(lecture.champs[champ].issue, course.saisie[champ]),
    ])
  ) as Record<ChampVerifie, StatutLecture>;

  const echec = { id: course.id, statut: "rejetee_auto" as const, valeurs, confiances, statutsLecture };

  /*
   * Asymétrie assumée. Un champ comparé à un barème doit être lu franchement :
   * sans lui, il n'y a rien à confirmer, et le confirmer quand même reviendrait
   * à valider sur rien. Un champ purement déclaratif peut rester non vérifié —
   * c'est déjà ce qui arrive quand il ne figure pas sur la capture, et une
   * lecture illisible est la même situation : nous ne savons pas.
   */
  for (const champ of regles.champsProbants) {
    if (statutsLecture[champ] === "verifie") continue;

    const motif =
      lecture.champs[champ].issue === "ambigue" ? "lecture_ambigue" : "echec_lecture";

    return { ...echec, motif };
  }

  /* On ne compare que ce qui a été lu franchement ET saisi. */
  const effectives = CHAMPS_VERIFIES.reduce<Tolerances>(
    (acc, champ) => ({ ...acc, [champ]: statutsLecture[champ] === "verifie" ? acc[champ] : null }),
    tolerancesEffectives(regles.tolerances, course.saisie, regles.champsFacultatifs)
  );

  const verdict = verifierCapture(course.saisie, lecture.valeurs, effectives);

  return {
    id: course.id,
    statut: verdict.accepte ? "validee_auto" : "rejetee_auto",
    motif: verdict.accepte ? null : resumerMotif(verdict.divergences),
    valeurs,
    confiances,
    statutsLecture,
  };
};

export const enregistrerVerdict = async (verdict: Verdict): Promise<void> => {
  const sql = db();

  for (const [champ, statut] of Object.entries(verdict.statutsLecture)) {
    await sql`
      insert into lectures_capture (course_id, champ, statut_lecture, confiance)
      values (${verdict.id}, ${champ}, ${statut}, ${verdict.confiances[champ as ChampVerifie]})
      on conflict (course_id, champ) do update
        set statut_lecture = excluded.statut_lecture,
            confiance = excluded.confiance,
            lue_le = now()
    `;
  }

  await sql`
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

/**
 * La classification est une CONSÉQUENCE du verdict, et vit donc au même endroit.
 *
 * Elle ne s'applique qu'à une course validée : ranger une course rejetée « sous
 * la grille » reviendrait à tirer une conclusion d'une donnée dont on vient de
 * dire qu'elle n'était pas vérifiée.
 */
export const classerCourse = (
  course: CourseAlire,
  verdict: Verdict,
  regles: ReglesTraitement
): Classement[] => {
  if (verdict.statut !== "validee_auto") return [];

  return classer(
    {
      prixEuros: course.saisie.prixEuros,
      distanceKm: course.saisie.distanceKm,
      dureeEstimeeMinutes: course.saisie.dureeEstimeeMinutes,
    },
    regles.reglesClassification(course.dateCourse, course.contexte)
  );
};

export const traiterEnAttente = async (
  regles: ReglesTraitement,
  limite: number
): Promise<Verdict[]> => {
  const verdicts: Verdict[] = [];

  for (const course of await coursesEnAttente(limite)) {
    const verdict = await lireUneCourse(course, regles);
    await enregistrerVerdict(verdict);

    const classements = classerCourse(course, verdict, regles);

    if (classements.length > 0) {
      await enregistrerClassification(course.id, course.dateCourse, classements);
    }

    verdicts.push({ ...verdict, classements });
  }

  return verdicts;
};
