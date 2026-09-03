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

import captures from "@/config/captures.json";
import gabarits from "@/config/gabarits.json";
import provenance from "@/config/provenance.json";
import villes from "@/config/villes.json";

import { baremes, formaterValeur } from "./baremes";
import { CLES_LEGALES, CLES_SYSTEME, UNITES } from "./cles";
import { uniqueEnVigueur } from "./periodes";
import type { ReglesAuthenticite } from "./validation/authenticite.ts";
import type { ContraintesCapture } from "./validation/capture.ts";
import type { Gabarit } from "./validation/gabarit.ts";
import type { SeuilsSession } from "./validation/regles-session.ts";
import type { Tolerances } from "./validation/ocr.ts";
import type { SeuilsPhysiques } from "./validation/regles-physiques.ts";

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

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

/* Conversions d'unités, pas des réglages : les tailles vivent en Ko et Mo dans
   la configuration, parce que c'est ce qui se lit sur la page Méthode, et le
   navigateur raisonne en octets. */
const OCTETS_PAR_KILOOCTET = 1024;
const OCTETS_PAR_MEGAOCTET = 1024 * 1024;

const enOctets = (valeur: number | null, facteur: number): number | null =>
  valeur === null ? null : valeur * facteur;

export const formatsAcceptes = captures.formats_acceptes;
export const formatsRefuses = captures.formats_refuses;
export const decisionCaptures = captures.decision;

export const contraintesCapture = (date: string): ContraintesCapture => ({
  formatsAcceptes: captures.formats_acceptes,
  tailleMaximaleOctets: enOctets(
    parametreSysteme(CLES_SYSTEME.tailleMaximaleCapture, date),
    OCTETS_PAR_MEGAOCTET
  ),
  tailleMinimaleOctets: enOctets(
    parametreSysteme(CLES_SYSTEME.tailleMinimaleCapture, date),
    OCTETS_PAR_KILOOCTET
  ),
});

/* ------------------------------------------------------------------ */
/* Tolérances du filtre OCR                                            */
/* ------------------------------------------------------------------ */

/*
 * Une tolérance par champ, parce que les sources d'erreur diffèrent : zéro sur
 * le prix, qui est la valeur probante du site, et de simples marges d'arrondi
 * sur la distance et le temps estimé.
 */
export const tolerancesOcr = (date: string): Tolerances => ({
  prixEuros: parametreSysteme(CLES_SYSTEME.tolerancePrix, date),
  distanceKm: parametreSysteme(CLES_SYSTEME.toleranceDistance, date),
  dureeEstimeeMinutes: parametreSysteme(CLES_SYSTEME.toleranceDureeEstimee, date),
});

/**
 * De quoi expliquer les contraintes au livreur, dans les unités de la
 * configuration plutôt qu'en octets.
 */
export const descriptionContraintes = (
  date: string
): { formats: string; typesMime: string; taille: string | null } => {
  const maximum = parametreSysteme(CLES_SYSTEME.tailleMaximaleCapture, date);
  const minimum = parametreSysteme(CLES_SYSTEME.tailleMinimaleCapture, date);

  const bornes = [
    minimum === null ? null : formaterValeur(minimum, UNITES.kilooctets),
    maximum === null ? null : formaterValeur(maximum, UNITES.megaoctets),
  ].filter((borne): borne is string => borne !== null);

  return {
    formats: captures.formats_acceptes.map((format) => format.libelle).join(", "),
    typesMime: captures.formats_acceptes.map((format) => format.type_mime).join(","),
    taille: bornes.length === 2 ? `de ${bornes[0]} à ${bornes[1]}` : (bornes[0] ?? null),
  };
};

/* ------------------------------------------------------------------ */
/* Authenticité                                                        */
/* ------------------------------------------------------------------ */

export const decisionProvenance = provenance.decision;
export const decisionGabarits = gabarits.decision;

/* La tolérance de position est exprimée en points de pourcentage dans la
   configuration, et en fraction de l'image dans le code qui compare. */
const POURCENT_EN_FRACTION = 100;

export const reglesAuthenticite = (date: string): ReglesAuthenticite => {
  const tolerance = parametreSysteme(CLES_SYSTEME.toleranceGabarit, date);

  return {
    provenance: {
      typesSourceGenerative: provenance.types_source_generative,
      logicielsGeneratifs: provenance.logiciels_generatifs,
    },
    gabarits: gabarits.gabarits as Gabarit[],
    toleranceGabarit: tolerance === null ? null : tolerance / POURCENT_EN_FRACTION,
    distancesPerceptuelles: {
      rejet: parametreSysteme(CLES_SYSTEME.distancePerceptuelleRejet, date),
      surveillance: parametreSysteme(CLES_SYSTEME.distancePerceptuelleSurveillance, date),
    },
  };
};

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/* La durée maximale vit en heures dans la configuration, parce que c'est ainsi
   qu'elle se lit sur la page Méthode ; le contrôle, lui, raisonne en minutes. */
const MINUTES_PAR_HEURE = 60;

export const seuilsSession = (date: string): SeuilsSession => {
  const maximumHeures = parametreSysteme(CLES_SYSTEME.dureeSessionMaximale, date);

  return {
    dureeMinimaleMinutes: parametreSysteme(CLES_SYSTEME.dureeSessionMinimale, date),
    dureeMaximaleMinutes: maximumHeures === null ? null : maximumHeures * MINUTES_PAR_HEURE,
    cadenceMaximaleParHeure: parametreSysteme(CLES_SYSTEME.cadenceMaximaleCourses, date),
  };
};

/* ------------------------------------------------------------------ */
/* Publication                                                         */
/* ------------------------------------------------------------------ */

export const seuilsStatistiques = (
  date: string
): { ecartsTypes: number | null; effectifMinimal: number | null } => ({
  ecartsTypes: parametreSysteme(CLES_SYSTEME.seuilOutliers, date),
  effectifMinimal: parametreSysteme(CLES_SYSTEME.seuilPublication, date),
});
