/**
 * Filtre 1 appliqué aux sessions — cohérence physique uniquement.
 *
 * Comme pour les courses, ce module ne rejette que l'impossible : une durée
 * invraisemblable, une cadence qu'aucune journée ne permet, un temps en course
 * supérieur au temps connecté.
 *
 * Et comme pour les courses, il n'a délibérément accès à AUCUN montant : le
 * revenu déclaré ne peut jamais motiver un rejet. Une session à 4 €/h connectée
 * est une preuve à publier, pas une erreur à filtrer.
 *
 * Module pur : les seuils arrivent en paramètre, depuis la configuration datée.
 */

import { dureeConnecteeMinutes, type Session } from "../calculs-session.ts";

const MINUTES_PAR_HEURE = 60;

export interface SeuilsSession {
  dureeMinimaleMinutes: number | null;
  dureeMaximaleMinutes: number | null;
  cadenceMaximaleParHeure: number | null;
}

export const CODES_ANOMALIE_SESSION = [
  "duree_sous_minimum",
  "duree_sur_maximum",
  "cadence_impossible",
  "temps_paye_superieur_au_connecte",
] as const;

export type CodeAnomalieSession = (typeof CODES_ANOMALIE_SESSION)[number];

export interface AnomalieSession {
  code: CodeAnomalieSession;
  valeur: number;
  limite: number;
}

const estNombre = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur);

export const controlerSession = (
  session: Session,
  seuils: SeuilsSession
): AnomalieSession[] => {
  const anomalies: AnomalieSession[] = [];
  const duree = dureeConnecteeMinutes(session);

  if (duree === null) return anomalies;

  if (estNombre(seuils.dureeMinimaleMinutes) && duree < seuils.dureeMinimaleMinutes) {
    anomalies.push({
      code: "duree_sous_minimum",
      valeur: duree,
      limite: seuils.dureeMinimaleMinutes,
    });
  }

  if (estNombre(seuils.dureeMaximaleMinutes) && duree > seuils.dureeMaximaleMinutes) {
    anomalies.push({
      code: "duree_sur_maximum",
      valeur: duree,
      limite: seuils.dureeMaximaleMinutes,
    });
  }

  if (estNombre(session.nombreCourses) && estNombre(seuils.cadenceMaximaleParHeure)) {
    const cadence = session.nombreCourses / (duree / MINUTES_PAR_HEURE);

    if (cadence > seuils.cadenceMaximaleParHeure) {
      anomalies.push({
        code: "cadence_impossible",
        valeur: cadence,
        limite: seuils.cadenceMaximaleParHeure,
      });
    }
  }

  /* Impossibilité arithmétique : elle ne dépend d'aucun seuil configurable. */
  if (estNombre(session.minutesEnCourse) && session.minutesEnCourse > duree) {
    anomalies.push({
      code: "temps_paye_superieur_au_connecte",
      valeur: session.minutesEnCourse,
      limite: duree,
    });
  }

  return anomalies;
};
