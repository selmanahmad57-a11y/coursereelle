/**
 * Les textes publics qui citent une valeur de la configuration.
 *
 * La FAQ et les mentions légales annoncent des délais : « supprimée 48 heures
 * après le verdict », « le sel est effacé au bout de 30 jours ». Écrire ces
 * nombres dans la prose créerait deux vérités — celle que la page affiche et
 * celle que le code applique — et rien ne garantirait qu'elles restent égales.
 * Un site qui promet un délai qu'il n'applique plus a menti, même sans mauvaise
 * foi.
 *
 * Les textes portent donc des jetons, `{delai_suppression}`, remplacés à
 * l'affichage par la valeur en vigueur. `lib/cles.ts` dit quel jeton désigne
 * quel barème, et un test vérifie que tout jeton employé y figure : une faute
 * de frappe fait échouer la suite au lieu de s'afficher entre accolades.
 *
 * Module pur : les valeurs arrivent en paramètre.
 */

const JETON = /\{([a-z_]+)\}/g;

/** Les jetons présents dans un texte, sans doublon. */
export const jetonsDe = (texte: string): string[] => [
  ...new Set([...texte.matchAll(JETON)].map((trouve) => trouve[1])),
];

/** Remplace ce qui est connu, et laisse voir ce qui ne l'est pas. */
export const remplacer = (
  texte: string,
  valeurs: Readonly<Record<string, string>>
): string =>
  Object.entries(valeurs).reduce(
    (acc, [jeton, valeur]) => acc.replaceAll(`{${jeton}}`, valeur),
    texte
  );
