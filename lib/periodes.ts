/**
 * Sélection des barèmes en vigueur à une date donnée.
 *
 * Module volontairement pur : aucune importation de configuration, pour qu'il
 * reste testable directement et réutilisable côté serveur comme côté client.
 *
 * Convention du projet : `valable_du` et `valable_au` sont inclusifs,
 * `valable_au` à null signifie « toujours en vigueur », `valable_du` à null
 * signifie « en vigueur depuis une date antérieure inconnue ».
 */

export interface Periode {
  valable_du: string | null;
  valable_au: string | null;
}

/** Les dates sont au format AAAA-MM-JJ : la comparaison lexicographique suffit. */
export const estEnVigueur = (periode: Periode, date: string): boolean => {
  if (periode.valable_du !== null && date < periode.valable_du) return false;
  if (periode.valable_au !== null && date > periode.valable_au) return false;
  return true;
};

export const enVigueur = <T extends Periode>(entrees: readonly T[], date: string): T[] =>
  entrees.filter((entree) => estEnVigueur(entree, date));

/**
 * Retourne l'unique entrée en vigueur à cette date, ou null s'il n'y en a
 * aucune. Le validateur garantit qu'il ne peut pas y en avoir deux pour une
 * même clé et une même portée : si cela arrive malgré tout, mieux vaut ne rien
 * appliquer que d'en choisir une au hasard.
 */
export const uniqueEnVigueur = <T extends Periode>(
  entrees: readonly T[],
  date: string
): T | null => {
  const candidates = enVigueur(entrees, date);
  return candidates.length === 1 ? candidates[0] : null;
};
