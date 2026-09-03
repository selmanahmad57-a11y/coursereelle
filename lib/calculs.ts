/**
 * Calculs de rémunération.
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
  /** Chiffre d'affaires brut ramené à l'heure, sur le temps réellement passé. */
  tauxHoraireReel: number | null;
  /** Le même montant ramené à l'heure sur le temps que l'application a estimé. */
  tauxHoraireEstime: number | null;
  /** De combien l'estimation de l'application gonfle le taux horaire affiché. */
  ecartRelatif: number | null;
  /** Chiffre d'affaires horaire après cotisations, avant frais de véhicule et impôt. */
  tauxHoraireNetEstime: number | null;
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
  const remuneration =
    course.prixPaye === null ? null : course.prixPaye + (course.pourboire ?? 0);

  const reel = tauxHoraire(remuneration, course.dureeReelleMinutes);
  const estime = tauxHoraire(remuneration, course.dureeEstimeeMinutes);

  return {
    tauxHoraireReel: reel,
    tauxHoraireEstime: estime,
    ecartRelatif: ecartRelatif(reel, estime),
    tauxHoraireNetEstime: apresCotisations(reel, tauxCotisationsPourcent),
    vitesseMoyenne: vitesseMoyenne(course.distanceKm, course.dureeReelleMinutes),
  };
};
