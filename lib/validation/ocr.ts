/**
 * Filtre 2 — lecture automatique de la capture.
 *
 * Ce module ne lit pas d'image : il définit le CONTRAT. D'un côté ce qu'un
 * moteur doit rendre à partir d'un récapitulatif — prix, distance, temps estimé
 * — de l'autre la comparaison aux valeurs saisies et les motifs de rejet
 * normalisés. Tesseract ou Cloud Vision se branchera derrière l'interface
 * `LecteurCapture` sans que la logique de comparaison change d'une ligne.
 *
 * Ce module ne compare que des grandeurs qui figurent sur le récapitulatif. Le
 * temps réel n'y figure pas — c'est précisément ce que la plateforme ne montre
 * pas — et n'est donc jamais vérifiable ici : il est fiabilisé par la masse,
 * au filtre 4.
 *
 * Rappel du principe qui prime sur tout : ce filtre vérifie que le livreur n'a
 * pas inventé ses chiffres, jamais que ces chiffres sont acceptables. Un prix
 * lu à 2,60 € et saisi à 2,60 € est une concordance parfaite, donc une course
 * validée — et une preuve à publier.
 *
 * Module pur : aucune tolérance n'est écrite ici, elles arrivent en paramètre
 * depuis la configuration datée.
 */

export const CHAMPS_VERIFIES = ["prixEuros", "distanceKm", "dureeEstimeeMinutes"] as const;

export type ChampVerifie = (typeof CHAMPS_VERIFIES)[number];

/** Ce que le moteur d'OCR doit rendre. `null` = le moteur n'a pas su lire ce champ. */
export type ValeursCapture = Record<ChampVerifie, number | null>;

/** Ce que le livreur a saisi dans le formulaire. */
export type ValeursSaisies = Record<ChampVerifie, number | null>;

/**
 * Écart maximal toléré entre la valeur lue et la valeur saisie, par champ.
 * `0` impose une concordance exacte ; `null` signifie que le champ n'est pas
 * vérifié par l'OCR — et non qu'il l'est sans limite.
 */
export type Tolerances = Record<ChampVerifie, number | null>;

export const MOTIFS_OCR = [
  "capture_illisible",
  "valeur_absente_de_la_capture",
  "valeur_non_saisie",
  "valeur_divergente",
] as const;

export type MotifOcr = (typeof MOTIFS_OCR)[number];

export interface Divergence {
  champ: ChampVerifie;
  motif: MotifOcr;
  saisi: number | null;
  lu: number | null;
  ecart: number | null;
  tolerance: number | null;
}

export interface Verdict {
  accepte: boolean;
  divergences: Divergence[];
  /** Motif normalisé, prêt pour la colonne motif_rejet. null si accepté. */
  motif: string | null;
}

/** Ce qu'un moteur d'OCR doit implémenter pour être branché derrière ce contrat. */
export interface LecteurCapture {
  lire(image: Uint8Array): Promise<ValeursCapture | null>;
}

const estNombre = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur);

/**
 * Compare la capture aux valeurs saisies. Une liste vide signifie que la preuve
 * concorde avec la déclaration.
 *
 * `lecture` à `null` signale une capture que le moteur n'a pas su lire du tout,
 * ce qui est un cas distinct d'un champ manquant.
 */
export const comparerCapture = (
  saisie: ValeursSaisies,
  lecture: ValeursCapture | null,
  tolerances: Tolerances
): Divergence[] => {
  const champsVerifiables = CHAMPS_VERIFIES.filter((champ) => tolerances[champ] !== null);

  if (lecture === null) {
    return champsVerifiables.map((champ) => ({
      champ,
      motif: "capture_illisible" as const,
      saisi: saisie[champ],
      lu: null,
      ecart: null,
      tolerance: tolerances[champ],
    }));
  }

  const divergences: Divergence[] = [];

  for (const champ of champsVerifiables) {
    const tolerance = tolerances[champ] as number;
    const lu = lecture[champ];
    const saisi = saisie[champ];

    if (!estNombre(lu)) {
      divergences.push({
        champ,
        motif: "valeur_absente_de_la_capture",
        saisi,
        lu: null,
        ecart: null,
        tolerance,
      });
      continue;
    }

    if (!estNombre(saisi)) {
      divergences.push({
        champ,
        motif: "valeur_non_saisie",
        saisi: null,
        lu,
        ecart: null,
        tolerance,
      });
      continue;
    }

    const ecart = Math.abs(saisi - lu);

    if (ecart > tolerance) {
      divergences.push({ champ, motif: "valeur_divergente", saisi, lu, ecart, tolerance });
    }
  }

  return divergences;
};

/**
 * Motif normalisé, stable, destiné à la colonne motif_rejet et au tableau de
 * surveillance : « motif:champ », les champs séparés par des virgules.
 */
export const resumerMotif = (divergences: readonly Divergence[]): string | null =>
  divergences.length === 0
    ? null
    : divergences.map((divergence) => `${divergence.motif}:${divergence.champ}`).join(",");

export const verifierCapture = (
  saisie: ValeursSaisies,
  lecture: ValeursCapture | null,
  tolerances: Tolerances
): Verdict => {
  const divergences = comparerCapture(saisie, lecture, tolerances);

  return {
    accepte: divergences.length === 0,
    divergences,
    motif: resumerMotif(divergences),
  };
};
