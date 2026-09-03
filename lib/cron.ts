/**
 * L'autorisation des tâches périodiques.
 *
 * La lecture des captures et l'entretien doivent se déclencher sans humain.
 * Une fois le site déployé, cela veut dire une requête HTTP — donc une porte
 * publique sur des opérations qui suppriment des fichiers et écrivent des
 * verdicts. Elle doit être fermée par défaut.
 *
 * DEUX REFUS, ET LE PREMIER EST LE PLUS IMPORTANT. Sans secret configuré, la
 * porte reste fermée : un déploiement où l'on aurait oublié la variable
 * n'ouvrirait pas l'entretien au premier venu. C'est l'inverse du réflexe
 * habituel, qui laisse passer quand la vérification n'est pas configurée.
 *
 * La comparaison est faite en temps constant. Le gain est théorique sur un
 * secret de cette longueur, mais un `===` sur un secret est une habitude qui
 * finit par se retrouver là où elle coûte.
 *
 * Module pur : le secret et l'en-tête arrivent en paramètre.
 */

const PREFIXE = "Bearer ";

const memeSecretEnTempsConstant = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
};

/**
 * L'en-tête `Authorization: Bearer <secret>` est la forme que Vercel envoie à
 * ses tâches planifiées, et celle que n'importe quel autre planificateur peut
 * reproduire. Une seule porte, quelle que soit la main qui frappe.
 */
export const tacheAutorisee = (
  enTete: string | null,
  secret: string | undefined
): boolean => {
  if (typeof secret !== "string" || secret === "") return false;
  if (enTete === null || !enTete.startsWith(PREFIXE)) return false;

  return memeSecretEnTempsConstant(enTete.slice(PREFIXE.length), secret);
};
