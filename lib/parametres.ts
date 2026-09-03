/**
 * Résolution des barèmes à une date donnée.
 *
 * C'est la seule couche qui relie le code à `config/baremes.json` et
 * `config/villes.json`. Tout ce qui est au-dessus (calculs, filtres) reçoit des
 * nombres en paramètre et ignore d'où ils viennent.
 *
 * Une course est jugée selon les règles en vigueur À SA DATE : toutes les
 * fonctions d'ici prennent donc une date, jamais « aujourd'hui » implicitement.
 */

import villes from "@/config/villes.json";

import { baremes } from "./baremes";
import { CLES_LEGALES, CLES_SYSTEME } from "./cles";
import { uniqueEnVigueur } from "./periodes";
import type { SeuilsPhysiques } from "./validation/regles-physiques";

export interface Ville {
  slug: string;
  libelle: string;
  zone: string;
  petite_couronne?: boolean;
}

export const listeVilles: Ville[] = villes.villes;

export const granulariteMaximale = villes.granularite_maximale;
export const interpretationZone = villes.interpretation_zone;

/**
 * Le livreur indique sa ville, jamais sa zone tarifaire : connaître la mécanique
 * d'une plateforme n'est pas son travail, et chaque question retirée du
 * formulaire compte.
 */
export const zoneDeLaVille = (slug: string | null): string | null =>
  listeVilles.find((ville) => ville.slug === slug)?.zone ?? null;

export const villeParSlug = (slug: string | null): Ville | null =>
  listeVilles.find((ville) => ville.slug === slug) ?? null;

/* ------------------------------------------------------------------ */
/* Lecture des barèmes                                                 */
/* ------------------------------------------------------------------ */

const memeVehicule = (declare: string | undefined, demande: string | null): boolean =>
  (declare ?? null) === demande;

export const parametreSysteme = (
  cle: string,
  date: string,
  vehicule: string | null = null
): number | null => {
  const candidates = baremes.parametres_systeme.filter(
    (parametre) => parametre.cle === cle && memeVehicule(parametre.vehicule, vehicule)
  );

  return uniqueEnVigueur(candidates, date)?.valeur ?? null;
};

export const regleLegale = (cle: string, date: string): number | null => {
  const candidates = baremes.regles_legales.filter((regle) => regle.cle === cle);
  return uniqueEnVigueur(candidates, date)?.valeur ?? null;
};

export const regleAnnoncee = (
  cle: string,
  date: string,
  { plateforme, zone = null }: { plateforme: string; zone?: string | null }
): number | null => {
  const candidates = baremes.regles_annoncees.filter(
    (regle) =>
      regle.cle === cle &&
      regle.plateformes.includes(plateforme) &&
      (regle.zone ?? null) === zone
  );

  return uniqueEnVigueur(candidates, date)?.valeur ?? null;
};

/* ------------------------------------------------------------------ */
/* Regroupements utilisés par le formulaire                            */
/* ------------------------------------------------------------------ */

export const seuilsPhysiques = (date: string, vehicule: string | null): SeuilsPhysiques => ({
  distanceMinimale: parametreSysteme(CLES_SYSTEME.distanceMinimale, date),
  distanceMaximale: parametreSysteme(CLES_SYSTEME.distanceMaximale, date),
  vitesseMinimale: parametreSysteme(CLES_SYSTEME.vitesseMinimale, date),
  vitesseMaximale:
    vehicule === null
      ? null
      : parametreSysteme(CLES_SYSTEME.vitesseMaximale, date, vehicule),
});

export const tauxCotisations = (date: string): number | null =>
  regleLegale(CLES_LEGALES.tauxCotisations, date);

export const ancienneteMaximale = (date: string): number | null =>
  parametreSysteme(CLES_SYSTEME.ancienneteMaximale, date);
