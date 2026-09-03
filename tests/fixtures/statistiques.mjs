/*
 * DONNEES FACTICES — ne doivent jamais atteindre la production.
 *
 * Ce fichier existe pour developper et tester la logique de publication sans
 * base de donnees. Rien ici ne decrit une course reelle : les valeurs sont
 * tirees d'un generateur deterministe.
 *
 * L'interdiction n'est pas une convention : tests/frontieres.test.mjs lit le
 * code de app/, components/ et lib/, et refuse toute importation dont le chemin
 * ressemble a une fixture. Ce module est donc structurellement inaccessible
 * depuis le site.
 */

const tirage = (graine, nombre, minimum, maximum) => {
  let etat = graine;
  const uniforme = () => {
    etat = (etat * 1103515245 + 12345) % 2147483648;
    return etat / 2147483648;
  };
  return Array.from(
    { length: nombre },
    () => minimum + ((uniforme() + uniforme()) / 2) * (maximum - minimum)
  );
};

/** Assez de courses pour depasser le seuil de publication. */
export const tauxHorairesSuffisants = tirage(1789, 500, 8, 22);

/** Trop peu de courses pour publier quoi que ce soit. */
export const tauxHorairesInsuffisants = tirage(1789, 30, 8, 22);

export const aucuneCourse = [];
