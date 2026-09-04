/**
 * Le temps de remplissage du formulaire.
 *
 * Le dossier pose une exigence chronométrable, et c'est la seule qui porte sur
 * nous plutôt que sur les plateformes : le formulaire doit se remplir en moins
 * de quatre-vingt-dix secondes sur téléphone, entre deux courses. Elle était
 * jusqu'ici invérifiable, faute d'être mesurée.
 *
 * CE QUI EST MESURÉ, ET RIEN D'AUTRE. Le nombre de secondes entre le premier
 * champ touché et l'envoi, et un type d'appareil réduit à deux valeurs. Pas
 * d'outil d'analyse tiers, pas d'identifiant, pas de trace de navigation, pas
 * d'enregistrement de la frappe. Un nombre et un mot pris dans une liste de
 * deux : rien là-dedans ne désigne quelqu'un.
 *
 * CE CHIFFRE NE PEUT PAS REJETER, et c'est structurel. Il n'entre pas dans
 * l'analyse de la soumission : une valeur absente, illisible ou absurde donne
 * `null` et la course passe exactement comme avant. Un remplissage lent ne dit
 * rien de la course — il dit quelque chose du formulaire, donc de nous.
 *
 * Une valeur aberrante — l'onglet laissé ouvert une nuit — n'est pas écartée à
 * l'écriture : elle l'est au moment de résumer, par la médiane, comme partout
 * ailleurs sur ce site.
 *
 * Module pur.
 */

import { mediane } from "./statistiques.ts";

export const analyserDureeRemplissage = (brut: string | undefined): number | null => {
  if (typeof brut !== "string" || brut.trim() === "") return null;

  const valeur = Number(brut.trim());

  /* Strictement positif et fini : une durée nulle ou négative n'est pas une
     mesure, c'est un défaut d'horloge ou une soumission fabriquée. */
  if (!Number.isFinite(valeur) || valeur <= 0) return null;

  return valeur;
};

export const analyserAppareil = (
  brut: string | undefined,
  connus: readonly string[]
): string | null => {
  const valeur = brut?.trim() ?? "";
  return connus.includes(valeur) ? valeur : null;
};

export interface ResumeRemplissage {
  appareil: string;
  effectif: number;
  mediane: number | null;
  /** Part des envois sous l'objectif, en points de pourcentage. */
  partSousObjectif: number | null;
}

/**
 * Le résumé par appareil. L'objectif ne filtre rien : il sert à dire quelle part
 * des envois le tient, ce qui est une observation sur le formulaire et non un
 * verdict sur les envois.
 */
export const resumerRemplissage = (
  mesures: readonly { appareil: string; secondes: number }[],
  objectifSecondes: number | null
): ResumeRemplissage[] => {
  const parAppareil = new Map<string, number[]>();

  for (const mesure of mesures) {
    parAppareil.set(mesure.appareil, [
      ...(parAppareil.get(mesure.appareil) ?? []),
      mesure.secondes,
    ]);
  }

  return [...parAppareil.entries()]
    .map(([appareil, secondes]) => ({
      appareil,
      effectif: secondes.length,
      mediane: mediane(secondes),
      partSousObjectif:
        objectifSecondes === null || secondes.length === 0
          ? null
          : (secondes.filter((valeur) => valeur <= objectifSecondes).length / secondes.length) *
            100,
    }))
    .sort((a, b) => a.appareil.localeCompare(b.appareil));
};
