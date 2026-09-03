/**
 * Cycle de vie d'une capture.
 *
 * Une capture d'écran de course contient bien plus que des chiffres : l'adresse
 * du restaurant, celle de la livraison, l'horaire. Le site promet que la ville
 * est la granularité maximale de ce qu'il conserve — une capture gardée
 * indéfiniment dément cette promesse.
 *
 * Elle sert donc à vérifier, puis elle disparaît. Suppression pure, pas de
 * caviardage : caviarder supposerait de repérer les zones sensibles sur chaque
 * variante d'écran, soit une détection de plus qui peut se tromper, et une image
 * conservée reste une surface de fuite. Ce qui n'existe plus ne peut pas fuiter.
 *
 * Le délai court à partir du VERDICT, pas de la soumission : tant qu'aucun
 * verdict n'est rendu, la preuve sert encore. Une course qui reste en attente
 * faute de moteur de lecture garde donc sa capture, et c'est voulu.
 *
 * Module pur : le délai arrive en paramètre, depuis la configuration datée.
 */

const MILLISECONDES_PAR_HEURE = 3_600_000;

export interface CaptureSuivie {
  id: string;
  cleR2: string | null;
  /** null tant que la course n'a pas reçu de verdict définitif. */
  verdictLe: string | null;
  supprimeeLe: string | null;
}

export const ETATS_CAPTURE = [
  "en_attente_verdict",
  "dans_le_delai",
  "echues",
  "supprimees",
] as const;

export type EtatCapture = (typeof ETATS_CAPTURE)[number];

const instant = (date: string | null): number | null => {
  if (date === null) return null;
  const valeur = Date.parse(date);
  return Number.isNaN(valeur) ? null : valeur;
};

/**
 * `null` quand la ligne ne décrit aucune capture vivante — rien à classer.
 */
export const etatCapture = (
  capture: CaptureSuivie,
  maintenant: string,
  delaiHeures: number | null
): EtatCapture | null => {
  if (capture.supprimeeLe !== null) return "supprimees";
  if (capture.cleR2 === null) return null;

  const verdict = instant(capture.verdictLe);
  if (verdict === null) return "en_attente_verdict";

  /* Sans délai configuré, on ne sait pas quand supprimer : on ne prétend pas
     que la capture est dans les temps, on la traite comme échue. */
  if (delaiHeures === null) return "echues";

  const echeance = verdict + delaiHeures * MILLISECONDES_PAR_HEURE;
  const courant = instant(maintenant);

  if (courant === null) return "dans_le_delai";

  return courant >= echeance ? "echues" : "dans_le_delai";
};

/**
 * Les captures dont le délai est écoulé. C'est exactement ce que l'entretien
 * doit supprimer, et ce que la surveillance doit trouver à zéro.
 */
export const capturesEchues = (
  captures: readonly CaptureSuivie[],
  maintenant: string,
  delaiHeures: number | null
): CaptureSuivie[] =>
  captures.filter((capture) => etatCapture(capture, maintenant, delaiHeures) === "echues");

export const repartitionCaptures = (
  captures: readonly CaptureSuivie[],
  maintenant: string,
  delaiHeures: number | null
): Record<EtatCapture, number> => {
  const comptes: Record<EtatCapture, number> = {
    en_attente_verdict: 0,
    dans_le_delai: 0,
    echues: 0,
    supprimees: 0,
  };

  for (const capture of captures) {
    const etat = etatCapture(capture, maintenant, delaiHeures);
    if (etat !== null) comptes[etat] += 1;
  }

  return comptes;
};
