/**
 * Ce que le site a le droit d'afficher, et quand.
 *
 * Trois états seulement, et aucun n'invente de chiffre. Tant que le seuil de
 * publication n'est pas atteint, le site montre un compteur et dit à partir de
 * quand les statistiques paraîtront — jamais une valeur provisoire, jamais une
 * estimation.
 *
 * C'est la traduction de la règle du dossier : un site vide décrédibilise, mais
 * un site qui publie un chiffre construit sur trente courses se décrédibilise
 * davantage, et pour plus longtemps.
 *
 * Module pur : le seuil arrive en paramètre, depuis la configuration datée.
 */

import { resumer, type Resume } from "./statistiques.ts";

export const MODES_PUBLICATION = ["aucune_donnee", "compteur", "statistiques"] as const;

export type ModePublication = (typeof MODES_PUBLICATION)[number];

export interface EtatPublication {
  mode: ModePublication;
  effectif: number;
  /** Combien de courses manquent encore avant publication. */
  restantAvantPublication: number | null;
  seuil: number | null;
  /** Renseigné uniquement en mode « statistiques ». */
  resume: Resume | null;
}

export const etatPublication = (
  valeurs: readonly number[],
  { ecartsTypes, effectifMinimal }: { ecartsTypes: number | null; effectifMinimal: number | null }
): EtatPublication => {
  const resume = resumer(valeurs, { ecartsTypes, effectifMinimal });

  if (resume.effectif === 0) {
    return {
      mode: "aucune_donnee",
      effectif: 0,
      restantAvantPublication: effectifMinimal,
      seuil: effectifMinimal,
      resume: null,
    };
  }

  if (!resume.publiable) {
    return {
      mode: "compteur",
      effectif: resume.effectif,
      restantAvantPublication:
        effectifMinimal === null ? null : Math.max(0, effectifMinimal - resume.effectif),
      seuil: effectifMinimal,
      resume: null,
    };
  }

  return {
    mode: "statistiques",
    effectif: resume.effectif,
    restantAvantPublication: 0,
    seuil: effectifMinimal,
    resume,
  };
};
