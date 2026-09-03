/**
 * La classification des courses validées.
 *
 * Une course vérifiée est ensuite RANGÉE : conforme à ce que la plateforme
 * annonce, ou en dessous, et de quelle façon. Ce classement n'écarte rien et ne
 * peut rien écarter — il décrit. La distinction est structurelle : les barèmes
 * qu'il consulte portent tous `usage: "comparaison"`, et une course payée
 * 2,60 € reste une course publiée, pas une erreur à filtrer.
 *
 * CHAQUE CLASSEMENT PORTE SA PREUVE. Dire « sous la grille kilométrique » sans
 * dire quelle grille, ce qu'elle donnait et ce qui a été payé, ce serait une
 * accusation. Chaque ligne transporte donc la clé du barème invoqué, la valeur
 * qu'il annonçait et la valeur constatée — de quoi refaire l'opération sans
 * nous croire.
 *
 * « TEMPS ESTIMÉ INCOHÉRENT » NE JUGE PAS LE LIVREUR, et c'est le point le plus
 * délicat de ce module. La tentation serait de comparer le temps vécu au temps
 * annoncé et de crier à l'incohérence au-delà d'un écart : ce serait dire « vous
 * avez mis trop longtemps », c'est-à-dire mettre en doute une donnée déclarative
 * course par course. Or le temps vécu se fiabilise par la masse — médianes et
 * exclusion des aberrantes — jamais par un classement affiché.
 *
 * Ce que cette catégorie constate est autre chose : l'estimation de la
 * plateforme confrontée à ses PROPRES chiffres. Une durée annoncée qui, pour la
 * distance annoncée, impliquerait une vitesse que le véhicule ne peut pas
 * atteindre. Onze kilomètres en quatre minutes font cent soixante-cinq
 * kilomètres à l'heure : l'application publie une estimation intenable, et
 * c'est elle seule que la catégorie décrit. Aucun seuil nouveau n'est inventé —
 * la vitesse maximale est celle que le contrôle physique emploie déjà.
 *
 * Module pur : les barèmes arrivent en paramètre.
 */

import { vitesseMoyenne } from "./calculs.ts";
import { CLES_ANNONCEES, CLES_SYSTEME, GROUPES_ANNONCES, UNITES } from "./cles.ts";

export const CATEGORIES = [
  "conforme",
  "sous_minimum_annonce",
  "sous_grille_kilometrique",
  "temps_estime_incoherent",
] as const;

export type Categorie = (typeof CATEGORIES)[number];

export interface GrilleAnnoncee {
  retraitFixe: number | null;
  parKm: number | null;
  remiseFixe: number | null;
  fraisServicePourcent: number | null;
}

export interface ReglesClassification {
  minimumParCourse: number | null;
  grille: GrilleAnnoncee;
  /** Vitesse maximale du véhicule déclaré : le même barème que le filtre physique. */
  vitesseMaximale: number | null;
}

export interface CourseAclasser {
  prixEuros: number | null;
  distanceKm: number | null;
  /** La durée que l'application affiche, seule employée ici. */
  dureeEstimeeMinutes: number | null;
}

export interface Classement {
  categorie: Categorie;
  /** Le barème invoqué. Nul pour « conforme », qui n'en invoque aucun. */
  cleBareme: string | null;
  valeurBareme: number | null;
  valeurConstatee: number | null;
  /**
   * L'unité des deux valeurs. Elle voyage avec elles parce qu'elle change d'une
   * catégorie à l'autre : des euros pour un manque à gagner, des kilomètres par
   * heure pour une estimation intenable. Un nombre affiché sans son unité, ou
   * avec celle de la catégorie voisine, ne prouve plus rien.
   */
  unite: string | null;
}

const utilisable = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur);

/**
 * Ce que la grille annoncée donne pour une distance.
 *
 * Retrait, kilomètres et remise, moins les frais de service. Une seule valeur
 * manquante rend le calcul impossible : on ne complète pas une grille annoncée
 * avec ce qu'on croit savoir d'elle.
 */
export const prixSelonGrille = (
  distanceKm: number | null,
  grille: GrilleAnnoncee
): number | null => {
  const { retraitFixe, parKm, remiseFixe, fraisServicePourcent } = grille;

  if (
    !utilisable(distanceKm) ||
    !utilisable(retraitFixe) ||
    !utilisable(parKm) ||
    !utilisable(remiseFixe) ||
    !utilisable(fraisServicePourcent)
  ) {
    return null;
  }

  const brut = retraitFixe + parKm * distanceKm + remiseFixe;
  return brut * (1 - fraisServicePourcent / 100);
};

/**
 * La vitesse que l'application s'attribue à elle-même : sa distance divisée par
 * sa durée. Rien du vécu n'entre dans ce calcul.
 */
export const vitesseImpliquee = (course: CourseAclasser): number | null =>
  vitesseMoyenne(course.distanceKm, course.dureeEstimeeMinutes);

export const classer = (
  course: CourseAclasser,
  regles: ReglesClassification
): Classement[] => {
  const classements: Classement[] = [];

  if (utilisable(course.prixEuros) && utilisable(regles.minimumParCourse)) {
    if (course.prixEuros < regles.minimumParCourse) {
      classements.push({
        categorie: "sous_minimum_annonce",
        cleBareme: CLES_ANNONCEES.minimumParCourse,
        valeurBareme: regles.minimumParCourse,
        valeurConstatee: course.prixEuros,
        unite: UNITES.euroParCourse,
      });
    }
  }

  const selonGrille = prixSelonGrille(course.distanceKm, regles.grille);

  if (utilisable(course.prixEuros) && selonGrille !== null && course.prixEuros < selonGrille) {
    classements.push({
      categorie: "sous_grille_kilometrique",
      cleBareme: GROUPES_ANNONCES.grilleKilometrique,
      valeurBareme: selonGrille,
      valeurConstatee: course.prixEuros,
      unite: UNITES.euroParCourse,
    });
  }

  const vitesse = vitesseImpliquee(course);

  if (vitesse !== null && utilisable(regles.vitesseMaximale) && vitesse > regles.vitesseMaximale) {
    classements.push({
      categorie: "temps_estime_incoherent",
      cleBareme: CLES_SYSTEME.vitesseMaximale,
      valeurBareme: regles.vitesseMaximale,
      valeurConstatee: vitesse,
      unite: UNITES.kilometreParHeure,
    });
  }

  /* Aucun écart constaté : la course est conforme à ce qui est annoncé. Ce
     classement n'invoque aucun barème, et la base l'exige — la contrainte
     `bareme_absent_si_conforme` refuse une ligne conforme qui en citerait un. */
  if (classements.length === 0) {
    return [
      {
        categorie: "conforme",
        cleBareme: null,
        valeurBareme: null,
        valeurConstatee: null,
        unite: null,
      },
    ];
  }

  return classements;
};
