/**
 * Accès au tableau de surveillance.
 *
 * Le tableau est en lecture seule stricte : il n'expose aucune action, aucun
 * bouton, aucun moyen de valider ou de rejeter quoi que ce soit. C'est le
 * principe du projet — le système décide, l'humain règle le système — traduit
 * en interface : ce qu'on y voit sert à modifier une valeur de configuration,
 * jamais à modifier une course.
 *
 * La comparaison du mot de passe est pure et testable ; le jeton déposé en
 * cookie est un condensat, pour que le mot de passe lui-même ne soit jamais
 * réécrit ailleurs que dans l'environnement.
 */

/**
 * Comparaison à durée constante, et surtout : un mot de passe non configuré
 * FERME l'accès au lieu de l'ouvrir. Sans cette règle, un déploiement où la
 * variable manque exposerait le tableau à tout le monde.
 */
export const accesAutorise = (fourni: string | null, attendu: string | undefined): boolean => {
  if (attendu === undefined || attendu === "") return false;
  if (fourni === null || fourni.length !== attendu.length) return false;

  let differences = 0;
  for (let index = 0; index < attendu.length; index += 1) {
    differences |= fourni.charCodeAt(index) ^ attendu.charCodeAt(index);
  }

  return differences === 0;
};

const enHexadecimal = (donnees: ArrayBuffer): string =>
  Array.from(new Uint8Array(donnees))
    .map((octet) => octet.toString(16).padStart(2, "0"))
    .join("");

/** Ce qui est déposé en cookie : jamais le mot de passe lui-même. */
export const jetonAcces = async (motDePasse: string): Promise<string> => {
  const donnees = new TextEncoder().encode(`surveillance:${motDePasse}`);
  return enHexadecimal(await crypto.subtle.digest("SHA-256", donnees));
};

export const NOM_COOKIE = "surveillance";
