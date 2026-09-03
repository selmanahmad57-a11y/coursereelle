/**
 * Les clés de configuration que le code lit réellement.
 *
 * Le code doit bien nommer ce qu'il va chercher dans `config/baremes.json` ;
 * ces identifiants sont donc rassemblés ici plutôt que dispersés en chaînes
 * littérales dans les composants. `tests/parametres.test.mjs` vérifie que chaque
 * clé nommée ici existe bien dans la configuration : renommer un barème sans
 * mettre le code à jour fait échouer les tests au lieu de faire disparaître une
 * valeur silencieusement de l'écran.
 *
 * Module pur, sans importation, pour rester testable directement.
 */

export const CLES_SYSTEME = {
  distanceMinimale: "distance_minimale",
  distanceMaximale: "distance_maximale",
  vitesseMinimale: "vitesse_moyenne_minimale",
  vitesseMaximale: "vitesse_moyenne_maximale",
  ancienneteMaximale: "anciennete_maximale_course",
  tailleMaximaleCapture: "taille_maximale_capture",
  tailleMinimaleCapture: "taille_minimale_capture",
  tolerancePrix: "tolerance_ocr_prix",
  toleranceDistance: "tolerance_ocr_distance",
  toleranceDureeEstimee: "tolerance_ocr_duree_estimee",
  distancePerceptuelleRejet: "distance_perceptuelle_rejet",
  distancePerceptuelleSurveillance: "distance_perceptuelle_surveillance",
  toleranceGabarit: "tolerance_position_gabarit",
  dureeSessionMinimale: "duree_session_minimale",
  dureeSessionMaximale: "duree_session_maximale",
  cadenceMaximaleCourses: "cadence_maximale_courses",
  seuilPublication: "seuil_publication_statistiques",
  seuilOutliers: "seuil_outliers_ecarts_types",
} as const;

export const CLES_LEGALES = {
  tauxCotisations: "taux_cotisations_sociales",
} as const;

export const CLES_ANNONCEES = {
  garantieHoraire: "garantie_horaire_brute",
  minimumParCourse: "minimum_par_course",
} as const;

/**
 * Les unités que le code désigne pour mettre en forme un résultat calculé.
 * Mêmes raisons, même garde-fou par les tests.
 */
export const UNITES = {
  euroParHeure: "EUR_PAR_HEURE",
  euroParCourse: "EUR_PAR_COURSE",
  pourcent: "POURCENT",
  kilometre: "KM",
  kilometreParHeure: "KM_PAR_HEURE",
  minutes: "MINUTES",
  jours: "JOURS",
  kilooctets: "KILOOCTETS",
  megaoctets: "MEGAOCTETS",
  bits: "BITS",
  coursesParHeure: "COURSES_PAR_HEURE",
  courses: "COURSES",
} as const;
