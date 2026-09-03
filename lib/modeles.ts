/**
 * Remplissage des modeles de texte.
 *
 * Sert a ecrire, a cote de chaque resultat, le calcul qui l'a produit :
 * « 8,08 € en 30 min » a cote de « 16,16 €/h ».
 *
 * Regle centrale : un modele n'est rendu que si TOUTES ses variables sont
 * connues. Rendre un calcul a trous — « 8,08 € en {duree_reelle} » — serait pire
 * que ne rien afficher, puisque le but est precisement de lever un doute.
 *
 * Module pur, teste directement.
 */

export const remplir = (
  modele: string,
  valeurs: Record<string, string | null>
): string | null => {
  let texte = modele;

  for (const [nom, valeur] of Object.entries(valeurs)) {
    if (!texte.includes(`{${nom}}`)) continue;
    if (valeur === null) return null;
    texte = texte.replaceAll(`{${nom}}`, valeur);
  }

  /* Une variable restee sans valeur signifie un modele et un appelant desaccordes. */
  return /\{[a-z_]+\}/.test(texte) ? null : texte;
};
