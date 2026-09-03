/**
 * Filtre 1 — cohérence physique.
 *
 * Ce module ne rejette que l'impossible : une vitesse moyenne qu'aucun véhicule
 * du type déclaré ne peut tenir, une distance hors des bornes plausibles, une
 * durée absurde.
 *
 * Règle de conception fondamentale du projet, à ne jamais contourner ici : les
 * règles annoncées par les plateformes ne sont JAMAIS des critères de rejet.
 * Une course payée sous le minimum annoncé traverse ce filtre intacte — c'est
 * une preuve à publier, pas une erreur à filtrer. Ce module n'a donc
 * délibérément accès à aucun montant.
 *
 * Module pur : les seuils arrivent en paramètre, depuis la configuration datée.
 */

import { vitesseMoyenne } from "../calculs.ts";

export interface SeuilsPhysiques {
  distanceMinimale: number | null;
  distanceMaximale: number | null;
  vitesseMinimale: number | null;
  /** Dépend du véhicule déclaré ; null si le véhicule est inconnu. */
  vitesseMaximale: number | null;
}

/** Exportee au runtime pour que les tests verifient que chaque code a un libelle. */
export const CODES_ANOMALIES = [
  "distance_sous_minimum",
  "distance_sur_maximum",
  "vitesse_sous_minimum",
  "vitesse_sur_maximum",
] as const;

export type CodeAnomalie = (typeof CODES_ANOMALIES)[number];

export interface Anomalie {
  code: CodeAnomalie;
  valeur: number;
  limite: number;
}

export interface CourseAControler {
  distanceKm: number | null;
  dureeReelleMinutes: number | null;
}

const estNombre = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur);

/**
 * Retourne la liste des impossibilités constatées. Une liste vide signifie que
 * la course franchit le filtre — pas qu'elle est normale, seulement qu'elle est
 * possible.
 */
export const controlerCoherencePhysique = (
  course: CourseAControler,
  seuils: SeuilsPhysiques
): Anomalie[] => {
  const anomalies: Anomalie[] = [];

  if (estNombre(course.distanceKm)) {
    if (estNombre(seuils.distanceMinimale) && course.distanceKm < seuils.distanceMinimale) {
      anomalies.push({
        code: "distance_sous_minimum",
        valeur: course.distanceKm,
        limite: seuils.distanceMinimale,
      });
    }
    if (estNombre(seuils.distanceMaximale) && course.distanceKm > seuils.distanceMaximale) {
      anomalies.push({
        code: "distance_sur_maximum",
        valeur: course.distanceKm,
        limite: seuils.distanceMaximale,
      });
    }
  }

  const vitesse = vitesseMoyenne(course.distanceKm, course.dureeReelleMinutes);

  if (estNombre(vitesse)) {
    if (estNombre(seuils.vitesseMinimale) && vitesse < seuils.vitesseMinimale) {
      anomalies.push({
        code: "vitesse_sous_minimum",
        valeur: vitesse,
        limite: seuils.vitesseMinimale,
      });
    }
    if (estNombre(seuils.vitesseMaximale) && vitesse > seuils.vitesseMaximale) {
      anomalies.push({
        code: "vitesse_sur_maximum",
        valeur: vitesse,
        limite: seuils.vitesseMaximale,
      });
    }
  }

  return anomalies;
};
