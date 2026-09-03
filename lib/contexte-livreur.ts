/**
 * Ce que l'appareil retient d'une visite à l'autre.
 *
 * Ville, plateforme et véhicule ne changent pratiquement jamais pour un même
 * livreur. Les retenir localement est ce qui permet de tenir les quatre-vingt-dix
 * secondes : un habitué ne saisit plus que les chiffres qui changent. La mémoire
 * est partagée entre le formulaire de course et celui de session.
 *
 * Rien ne quitte l'appareil : ces valeurs ne sont pas des identifiants, et elles
 * ne sont écrites nulle part ailleurs que dans le navigateur du livreur.
 *
 * Le stockage local et l'horloge sont des sources EXTÉRIEURES à React : on s'y
 * abonne via useSyncExternalStore plutôt que de les recopier dans un état depuis
 * un effet. Le rendu serveur ne connaît ni l'un ni l'autre, et une recopie après
 * montage provoquerait un rendu en cascade.
 */

export const CLE_MEMOIRE = "coursereelle.contexte";

/** Valeur réservée du sélecteur de ville, pour la saisie libre. */
export const VILLE_AUTRE = "autre";

export interface Contexte {
  ville: string;
  plateforme: string;
  vehicule: string;
}

export const CONTEXTE_VIDE: Contexte = { ville: "", plateforme: "", vehicule: "" };

export const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

export const abonnerStockage = (rappel: () => void) => {
  window.addEventListener("storage", rappel);
  return () => window.removeEventListener("storage", rappel);
};

export const lireStockage = (): string | null => {
  try {
    return window.localStorage.getItem(CLE_MEMOIRE);
  } catch {
    return null;
  }
};

export const stockageAuRendu = (): string | null => null;

export const ecrireStockage = (contexte: Contexte) => {
  try {
    window.localStorage.setItem(CLE_MEMOIRE, JSON.stringify(contexte));
  } catch {
    /* Écriture refusée (navigation privée, réglage du navigateur) : sans conséquence. */
  }
};

export const decoder = (brut: string | null): Contexte => {
  if (!brut) return CONTEXTE_VIDE;
  try {
    return { ...CONTEXTE_VIDE, ...(JSON.parse(brut) as Partial<Contexte>) };
  } catch {
    return CONTEXTE_VIDE;
  }
};

export const sansAbonnement = () => () => {};
export const dateAuRendu = (): string => "";

/** Les livreurs saisissent « 12,2 » aussi souvent que « 12.2 ». */
export const enNombre = (saisie: string): number | null => {
  const nettoye = saisie.replace(",", ".").trim();
  if (nettoye === "") return null;
  const valeur = Number(nettoye);
  return Number.isFinite(valeur) ? valeur : null;
};
