/**
 * Lecture d'un nombre tel qu'un livreur l'écrit.
 *
 * Même leçon que les durées, et je ne l'avais appliquée qu'aux durées : un champ
 * doit accepter ce que les gens écrivent, pas ce qui arrange le code. Quelqu'un
 * qui lit « 8,08 € » sur son écran recopie « 8,08 € », et quelqu'un qui lit
 * « 12,2 km » recopie « 12,2 km ». Refuser ces saisies, c'est perdre la course.
 *
 * Sont acceptés :
 *
 *     8,08        8.08        8,08 €       8.08 EUR
 *     12,2 km     12 km       +8,08
 *     1 234,56    1 234,56 €  (espaces fines insécables comprises)
 *
 * Ce qui reste refusé, et doit l'être : tout ce qui n'est pas un nombre unique.
 * « environ 8 », « 8 à 9 », « 8/10 » ne sont pas approchés mais rejetés — une
 * valeur inventée alimenterait un taux horaire faux.
 *
 * Module pur, testé directement.
 */

/* Espaces ordinaires, insécables et fines insécables : les trois servent de
   séparateur de milliers en français, selon d'où le texte a été copié. */
const ESPACES = /[\s   ]/g;

/* Une unité ou un symbole monétaire à la fin, tel qu'il s'affiche à l'écran. */
const UNITE_FINALE = /[a-z€$£%°/]+$/i;

const NOMBRE = /^\d+(?:\.\d+)?$/;

export const analyserNombre = (saisie: string | undefined): number | null => {
  if (saisie === undefined) return null;

  let texte = saisie.replace(ESPACES, "");
  if (texte === "") return null;

  if (texte.startsWith("+")) texte = texte.slice(1);

  texte = texte.replace(UNITE_FINALE, "");
  texte = texte.replace(",", ".");

  if (!NOMBRE.test(texte)) return null;

  const valeur = Number(texte);
  return Number.isFinite(valeur) ? valeur : null;
};

/** Un compte ne peut pas être fractionnaire : sept courses et demie n'existent pas. */
export const analyserEntier = (saisie: string | undefined): number | null => {
  const valeur = analyserNombre(saisie);
  if (valeur === null) return null;
  return Number.isInteger(valeur) ? valeur : null;
};
