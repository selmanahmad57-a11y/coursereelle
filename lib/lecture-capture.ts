/**
 * Extraction des valeurs d'une capture, par la forme.
 *
 * Le lecteur automatique rend du texte ; ce module en tire des nombres et rien
 * d'autre. Le texte entre ici, il n'en ressort jamais : ce que la fonction
 * renvoie ne contient que des valeurs, des confiances et des verdicts de
 * lecture. Même discipline que l'outil de calibration, et pour la même raison —
 * une capture porte l'adresse du restaurant et celle du client.
 *
 * TROIS ISSUES POSSIBLES PAR CHAMP, et aucune n'est un pari :
 *
 *   lue        une seule valeur, lue franchement — on peut comparer.
 *   absente    rien de cette forme sur la capture — le champ n'est pas vérifié.
 *   ambigue    plusieurs valeurs différentes de la même forme : on ne devine pas
 *              laquelle est la bonne. Choisir celle qui correspond à la saisie
 *              reviendrait à valider par hypothèse, ce qui ne vérifie rien.
 *   peu_sure   lecture sous le seuil de confiance. Ni validation ni reproche :
 *              une capture plus nette est demandée.
 *
 * Module pur : motifs et seuil arrivent en paramètre, depuis la configuration.
 */

import { analyserDuree } from "./duree.ts";
import { analyserNombre } from "./nombre.ts";
import type { ChampVerifie, ValeursCapture } from "./validation/ocr.ts";

export interface MotLu {
  debut: number;
  fin: number;
  confiance: number;
}

export interface ZoneLue {
  /** Le texte lu. Il entre, il ne sort pas. */
  texte: string;
  confiance: number;
  /**
   * Confiance mot à mot, avec la position de chaque mot dans `texte`.
   *
   * Sans cela, une valeur bien lue hérite de la confiance du mot le plus flou
   * de sa ligne — et le récapitulatif met durée et distance sur la même ligne.
   * La confiance qui compte est celle de ce qu'on a vraiment lu, pas celle de
   * son voisinage.
   */
  mots?: readonly MotLu[];
}

export const ISSUES_LECTURE = ["lue", "absente", "ambigue", "peu_sure"] as const;

export type IssueLecture = (typeof ISSUES_LECTURE)[number];

export interface LectureChamp {
  issue: IssueLecture;
  valeur: number | null;
  confiance: number | null;
}

export interface ReglesLecture {
  /** Motif de forme par champ vérifiable, depuis config/interface-uber.json. */
  motifs: Partial<Record<ChampVerifie, string>>;
  confianceMinimale: number;
}

/** Une durée se lit « 16 min 34 s » ; les autres grandeurs sont des nombres. */
const enValeur = (champ: ChampVerifie, extrait: string): number | null =>
  champ === "dureeEstimeeMinutes" ? analyserDuree(extrait) : analyserNombre(extrait);

const MEME_VALEUR = 1e-9;

/** La confiance d'un extrait : celle du moins sûr des mots qu'il recouvre. */
const confianceDe = (zone: ZoneLue, debut: number, fin: number): number => {
  const recouverts = (zone.mots ?? []).filter((mot) => mot.debut < fin && mot.fin > debut);
  if (recouverts.length === 0) return zone.confiance;
  return Math.min(...recouverts.map((mot) => mot.confiance));
};

export const lireChamp = (
  champ: ChampVerifie,
  zones: readonly ZoneLue[],
  regles: ReglesLecture
): LectureChamp => {
  const source = regles.motifs[champ];
  if (source === undefined) return { issue: "absente", valeur: null, confiance: null };

  let forme: RegExp;
  try {
    forme = new RegExp(source, "g");
  } catch {
    return { issue: "absente", valeur: null, confiance: null };
  }

  const trouvees: { valeur: number; confiance: number }[] = [];

  for (const zone of zones) {
    forme.lastIndex = 0;

    for (const trouve of zone.texte.matchAll(forme)) {
      const valeur = enValeur(champ, trouve[0]);
      if (valeur === null) continue;

      const debut = trouve.index ?? 0;
      const fin = debut + trouve[0].length;

      trouvees.push({ valeur, confiance: confianceDe(zone, debut, fin) });
    }
  }

  if (trouvees.length === 0) return { issue: "absente", valeur: null, confiance: null };

  const distinctes = trouvees.filter(
    (candidate, index) =>
      trouvees.findIndex((autre) => Math.abs(autre.valeur - candidate.valeur) < MEME_VALEUR) ===
      index
  );

  if (distinctes.length > 1) {
    return { issue: "ambigue", valeur: null, confiance: null };
  }

  /* Une même valeur peut apparaître plusieurs fois — un total répété en bas
     d'écran. On retient la lecture la plus sûre. */
  const meilleure = trouvees.reduce((a, b) => (b.confiance > a.confiance ? b : a));

  if (meilleure.confiance < regles.confianceMinimale) {
    return { issue: "peu_sure", valeur: null, confiance: meilleure.confiance };
  }

  return { issue: "lue", valeur: meilleure.valeur, confiance: meilleure.confiance };
};

export interface Lecture {
  champs: Record<ChampVerifie, LectureChamp>;
  /** Ce que le contrat OCR consomme : des nombres, jamais du texte. */
  valeurs: ValeursCapture;
}

export const lireCapture = (
  champsVerifies: readonly ChampVerifie[],
  zones: readonly ZoneLue[],
  regles: ReglesLecture
): Lecture => {
  const champs = {} as Record<ChampVerifie, LectureChamp>;
  const valeurs = {} as ValeursCapture;

  for (const champ of champsVerifies) {
    const lecture = lireChamp(champ, zones, regles);
    champs[champ] = lecture;
    valeurs[champ] = lecture.valeur;
  }

  return { champs, valeurs };
};

/**
 * Une lecture hésitante ou ambiguë sur un champ que l'on comptait vérifier
 * interdit tout verdict : ni validation, ni reproche.
 */
export const lectureConcluante = (
  lecture: Lecture,
  champsAttendus: readonly ChampVerifie[]
): { concluante: boolean; motif: string | null } => {
  for (const champ of champsAttendus) {
    const issue = lecture.champs[champ]?.issue;

    if (issue === "peu_sure") return { concluante: false, motif: "echec_lecture" };
    if (issue === "ambigue") return { concluante: false, motif: "lecture_ambigue" };
  }

  return { concluante: true, motif: null };
};
