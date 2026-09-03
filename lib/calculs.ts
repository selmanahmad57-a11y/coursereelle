/**
 * Calculs de rémunération.
 *
 * Règle qui gouverne tout ce module : le site mesure ce que la PLATEFORME PAIE,
 * pas ce que le livreur reçoit. Le pourboire vient du client ; l'inclure dans le
 * chiffre principal laisserait la générosité des clients masquer le niveau de
 * paiement de la plateforme — exactement le biais que le site existe pour
 * dissiper. Le taux avec pourboire est calculé et affiché, mais en second, et
 * n'est jamais comparé à un barème annoncé.
 *
 * Module volontairement pur : aucune valeur n'y est écrite en dur, tous les
 * barèmes arrivent en paramètre. Le seul nombre présent est la conversion
 * minutes vers heures, qui est une unité, pas un réglage.
 *
 * Toute fonction renvoie `null` plutôt qu'une valeur fausse quand l'entrée ne
 * permet pas de calculer : sur un formulaire rempli en direct, la plupart des
 * champs sont vides la plupart du temps.
 */

const MINUTES_PAR_HEURE = 60;

export interface Course {
  /** Montant payé par la plateforme, hors pourboire. */
  prixPaye: number | null;
  pourboire: number | null;
  distanceKm: number | null;
  /** Temps vécu, de l'acceptation à la remise au client. */
  dureeReelleMinutes: number | null;
  /** Temps annoncé par l'application. */
  dureeEstimeeMinutes: number | null;
}

export interface Resultat {
  /**
   * Chiffre principal : ce que la plateforme a payé, ramené à l'heure sur le
   * temps réellement passé. Hors pourboire, donc seul comparable aux barèmes
   * annoncés — la garantie horaire est elle aussi calculée pourboires exclus.
   */
  tauxPlateforme: number | null;
  /** Le même montant ramené à l'heure sur le temps que l'application a estimé. */
  tauxPlateformeEstime: number | null;
  /** De combien l'estimation de l'application gonfle le taux affiché. */
  ecartRelatif: number | null;
  /** Le taux plateforme après cotisations, avant frais de véhicule et impôt. */
  tauxPlateformeNet: number | null;
  /**
   * Ce que le livreur a réellement encaissé, pourboire compris. Information
   * utile pour lui, jamais comparée à un barème : le pourboire ne vient pas de
   * la plateforme.
   */
  tauxAvecPourboire: number | null;
  vitesseMoyenne: number | null;
}

const estNombreUtilisable = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur);

const estDureeUtilisable = (valeur: number | null): valeur is number =>
  estNombreUtilisable(valeur) && valeur > 0;

/** Ramène un montant à l'heure. Le pourboire est inclus s'il est renseigné. */
export const tauxHoraire = (montant: number | null, dureeMinutes: number | null): number | null => {
  if (!estNombreUtilisable(montant) || !estDureeUtilisable(dureeMinutes)) return null;
  return montant / (dureeMinutes / MINUTES_PAR_HEURE);
};

export const vitesseMoyenne = (
  distanceKm: number | null,
  dureeMinutes: number | null
): number | null => {
  if (!estNombreUtilisable(distanceKm) || !estDureeUtilisable(dureeMinutes)) return null;
  return distanceKm / (dureeMinutes / MINUTES_PAR_HEURE);
};

/**
 * Part que l'estimation ajoute au taux horaire réel, en points de pourcentage.
 * Un temps estimé deux fois plus court double le taux affiché : l'écart vaut 100.
 */
export const ecartRelatif = (reel: number | null, estime: number | null): number | null => {
  if (!estNombreUtilisable(reel) || !estNombreUtilisable(estime) || reel === 0) return null;
  return ((estime - reel) / reel) * 100;
};

/**
 * Retire les cotisations sociales d'un montant brut.
 * Le taux arrive en points de pourcentage, comme partout dans la configuration.
 */
export const apresCotisations = (
  brut: number | null,
  tauxCotisationsPourcent: number | null
): number | null => {
  if (!estNombreUtilisable(brut) || !estNombreUtilisable(tauxCotisationsPourcent)) return null;
  return brut * (1 - tauxCotisationsPourcent / 100);
};

export const calculer = (course: Course, tauxCotisationsPourcent: number | null): Resultat => {
  /* Le montant de la plateforme seul : c'est lui qui porte toutes les comparaisons. */
  const tauxPlateforme = tauxHoraire(course.prixPaye, course.dureeReelleMinutes);
  const tauxPlateformeEstime = tauxHoraire(course.prixPaye, course.dureeEstimeeMinutes);

  const encaisse =
    course.prixPaye === null ? null : course.prixPaye + (course.pourboire ?? 0);

  return {
    tauxPlateforme,
    tauxPlateformeEstime,
    ecartRelatif: ecartRelatif(tauxPlateforme, tauxPlateformeEstime),
    tauxPlateformeNet: apresCotisations(tauxPlateforme, tauxCotisationsPourcent),
    tauxAvecPourboire: tauxHoraire(encaisse, course.dureeReelleMinutes),
    vitesseMoyenne: vitesseMoyenne(course.distanceKm, course.dureeReelleMinutes),
  };
};
