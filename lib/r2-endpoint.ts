/**
 * Construction de l'endpoint R2.
 *
 * Un bucket cree dans une juridiction n'a pas la meme adresse S3 qu'un bucket
 * ordinaire : l'identifiant de juridiction s'insere dans le nom d'hote. Se
 * tromper ne produit pas une erreur claire mais un « Access Denied » qui
 * ressemble a un probleme de droits, et fait chercher au mauvais endroit.
 *
 * Module pur, sans dependance : la construction est verifiee par les tests.
 */

/** Juridictions proposees par Cloudflare. « default » = aucune. */
export const JURIDICTIONS_R2 = ["default", "eu", "fedramp"] as const;

export type JuridictionR2 = (typeof JURIDICTIONS_R2)[number];

export const juridictionValide = (valeur: string | undefined): JuridictionR2 =>
  (JURIDICTIONS_R2 as readonly string[]).includes(valeur ?? "")
    ? (valeur as JuridictionR2)
    : "default";

export const endpointR2 = (compte: string, juridiction: JuridictionR2): string =>
  juridiction === "default"
    ? `https://${compte}.r2.cloudflarestorage.com`
    : `https://${compte}.${juridiction}.r2.cloudflarestorage.com`;
