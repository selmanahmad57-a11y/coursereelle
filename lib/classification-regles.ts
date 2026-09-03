/**
 * La résolution des barèmes dont la classification a besoin.
 *
 * DEUX CONSOMMATEURS, UNE SEULE VÉRITÉ. La classification est calculée à deux
 * moments : au verdict, par un script qui tourne hors de Next et n'a pas accès à
 * l'alias de configuration ; et à l'affichage, par la page qui liste les
 * courses. Si chacun résolvait les barèmes à sa façon, une correction de grille
 * ne s'appliquerait qu'à moitié, et la page contredirait la base sans que rien
 * ne le signale.
 *
 * Ce module est donc pur et reçoit les barèmes en paramètre : la page lui passe
 * ceux qu'elle importe, le script ceux qu'il lit sur le disque, et les deux
 * obtiennent le même résultat par construction.
 *
 * La zone ne décline que le tarif kilométrique — c'est le seul des quatre
 * éléments de la grille que la configuration porte par zone. La passer aux trois
 * autres ne trouverait rien et rendrait la grille incalculable.
 */

import type { ReglesClassification } from "./classification.ts";
import { CLES_ANNONCEES, CLES_SYSTEME } from "./cles.ts";
import { uniqueEnVigueur, type Periode } from "./periodes.ts";

export interface RegleAnnonceeBrute extends Periode {
  cle: string;
  valeur: number;
  plateformes: readonly string[];
  zone?: string | null;
}

export interface ParametreBrut extends Periode {
  cle: string;
  valeur: number;
  vehicule?: string | null;
}

export interface BaremesBruts {
  regles_annoncees: readonly RegleAnnonceeBrute[];
  parametres_systeme: readonly ParametreBrut[];
}

export interface ContexteCourse {
  plateforme: string;
  zone: string | null;
  vehicule: string | null;
}

const annoncee = (
  baremes: BaremesBruts,
  cle: string,
  date: string,
  plateforme: string,
  zone: string | null
): number | null =>
  uniqueEnVigueur(
    baremes.regles_annoncees.filter(
      (regle) =>
        regle.cle === cle &&
        regle.plateformes.includes(plateforme) &&
        (regle.zone ?? null) === zone
    ),
    date
  )?.valeur ?? null;

const systeme = (
  baremes: BaremesBruts,
  cle: string,
  date: string,
  vehicule: string | null
): number | null =>
  uniqueEnVigueur(
    baremes.parametres_systeme.filter(
      (parametre) => parametre.cle === cle && (parametre.vehicule ?? null) === vehicule
    ),
    date
  )?.valeur ?? null;

export const reglesClassificationDepuis = (
  baremes: BaremesBruts,
  date: string,
  { plateforme, zone, vehicule }: ContexteCourse
): ReglesClassification => ({
  minimumParCourse: annoncee(baremes, CLES_ANNONCEES.minimumParCourse, date, plateforme, null),
  grille: {
    retraitFixe: annoncee(baremes, CLES_ANNONCEES.retraitFixe, date, plateforme, null),
    parKm: annoncee(baremes, CLES_ANNONCEES.remunerationParKm, date, plateforme, zone),
    remiseFixe: annoncee(baremes, CLES_ANNONCEES.remiseFixe, date, plateforme, null),
    fraisServicePourcent: annoncee(baremes, CLES_ANNONCEES.fraisService, date, plateforme, null),
  },
  vitesseMaximale:
    vehicule === null ? null : systeme(baremes, CLES_SYSTEME.vitesseMaximale, date, vehicule),
});
