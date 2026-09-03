/**
 * Lecture d'une durée telle qu'un livreur l'écrit.
 *
 * Le piège est réel et il a coûté une soumission perdue : le récapitulatif
 * affiche « 16 min 34 s », et le livreur recopie naturellement « 16,34 ». Lu
 * comme un nombre décimal, cela vaut 16 min 20 s — et surtout, envoyé tel quel à
 * une colonne entière, cela faisait échouer l'écriture sans rien expliquer.
 *
 * Ce module accepte donc les formes réellement écrites :
 *
 *     16          -> 16 minutes
 *     16,5        -> 16 minutes et 30 secondes
 *     16:34       -> 16 minutes et 34 secondes
 *     16 min 34 s -> 16 minutes et 34 secondes
 *     16m34       -> 16 minutes et 34 secondes
 *
 * Le résultat est toujours exprimé en minutes, décimales comprises. La règle de
 * départage, pour « 16,34 », reste la lecture décimale : c'est la seule qui soit
 * cohérente avec un champ qui annonce des minutes. Le formulaire propose donc
 * explicitement la forme « 16:34 », qui ne se prête à aucune interprétation.
 *
 * Module pur, testé directement.
 */

const SECONDES_PAR_MINUTE = 60;

/** « 16:34 », « 16 min 34 s », « 16m34 » : deux nombres séparés par un marqueur. */
const MINUTES_ET_SECONDES =
  /^(\d+)\s*(?::|h|m|min|mn|minutes?)\s*(\d{1,2})\s*(?:s|sec|secondes?)?$/i;

/** « 16 », « 16,5 », « 16.5 », éventuellement suivi d'une unité. */
const MINUTES_SEULES = /^(\d+(?:[.,]\d+)?)\s*(?:m|min|mn|minutes?)?$/i;

/**
 * `null` quand la saisie est vide ou incompréhensible — jamais une valeur
 * approchée : mieux vaut un champ refusé qu'une durée fausse.
 */
export const analyserDuree = (saisie: string | undefined): number | null => {
  if (saisie === undefined) return null;

  const nettoyee = saisie.trim().replace(/\s+/g, " ");
  if (nettoyee === "") return null;

  const composee = nettoyee.match(MINUTES_ET_SECONDES);
  if (composee) {
    const minutes = Number(composee[1]);
    const secondes = Number(composee[2]);

    if (secondes >= SECONDES_PAR_MINUTE) return null;
    return minutes + secondes / SECONDES_PAR_MINUTE;
  }

  const simple = nettoyee.match(MINUTES_SEULES);
  if (simple) {
    const minutes = Number(simple[1].replace(",", "."));
    return Number.isFinite(minutes) ? minutes : null;
  }

  return null;
};

/** Arrondi à la seconde : au-delà, ce sont des chiffres que personne n'a mesurés. */
export const arrondirDuree = (minutes: number): number =>
  Math.round(minutes * SECONDES_PAR_MINUTE) / SECONDES_PAR_MINUTE;
