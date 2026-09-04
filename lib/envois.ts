/**
 * La mémoire locale des envois : ce que ce navigateur a soumis.
 *
 * LE TROU QU'ELLE COMBLE. La lecture des captures est différée : un livreur
 * envoie sa course, lit « Course reçue », et le verdict tombe un quart d'heure
 * plus tard. S'il est négatif, personne ne le lui dit — le site n'a ni compte,
 * ni adresse, ni aucun moyen de le joindre, délibérément. Deux courses réelles
 * ont ainsi été refusées sans que leur auteur l'apprenne.
 *
 * LE PRINCIPE, ET SA LIMITE. Le navigateur sait ce qu'il a envoyé ; le serveur
 * n'apprend rien de plus. Les identifiants vivent ici, sur l'appareil, comme la
 * ville et la plateforme. La page « Mes envois » les interroge un par un, et
 * n'obtient que ce que le registre public dirait déjà.
 *
 * La conséquence est assumée : changer de téléphone ou vider son navigateur fait
 * perdre le SUIVI, jamais les courses — elles restent publiées. C'est le prix de
 * l'absence de compte, et ce prix a été choisi.
 *
 * Module pur pour l'encodage ; les accès au stockage n'échouent jamais
 * bruyamment.
 */

export const CLE_ENVOIS = "coursereelle.envois";

export interface Envoi {
  id: string;
  /** Quand ce navigateur l'a envoyé. Sert à ordonner, jamais à identifier. */
  envoyeLe: string;
}

const IDENTIFIANT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un identifiant a la forme d'un UUID, ou il n'en est pas un.
 *
 * Ce contrôle a deux effets : il empêche une valeur abîmée du stockage
 * d'atteindre le serveur, et il rend l'interrogation inutile à qui n'a pas
 * soumis — un identifiant de cette forme ne se devine pas.
 */
export const estIdentifiant = (valeur: unknown): valeur is string =>
  typeof valeur === "string" && IDENTIFIANT.test(valeur);

export const decoderEnvois = (brut: string | null, maximum: number): Envoi[] => {
  if (brut === null) return [];

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return [];
  }

  if (!Array.isArray(lu)) return [];

  const retenus: Envoi[] = [];
  const vus = new Set<string>();

  for (const entree of lu) {
    if (entree === null || typeof entree !== "object") continue;

    const { id, envoyeLe } = entree as Record<string, unknown>;
    if (!estIdentifiant(id) || vus.has(id)) continue;

    vus.add(id);
    retenus.push({ id, envoyeLe: typeof envoyeLe === "string" ? envoyeLe : "" });
  }

  return retenus.slice(0, maximum);
};

/** Le plus récent d'abord, sans doublon, et borné. */
export const ajouterEnvoi = (
  envois: readonly Envoi[],
  nouveau: Envoi,
  maximum: number
): Envoi[] => {
  if (!estIdentifiant(nouveau.id)) return [...envois];

  return [nouveau, ...envois.filter((envoi) => envoi.id !== nouveau.id)].slice(0, maximum);
};

export const lireEnvois = (): string | null => {
  try {
    return window.localStorage.getItem(CLE_ENVOIS);
  } catch {
    return null;
  }
};

export const envoisAuRendu = (): string | null => null;

export const ecrireEnvois = (envois: readonly Envoi[]) => {
  try {
    window.localStorage.setItem(CLE_ENVOIS, JSON.stringify(envois));
  } catch {
    /* Stockage refusé : le suivi ne sera pas disponible, l'envoi si. */
  }
};
