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
  reliefMinimalEmpreinte: "relief_minimal_empreinte",
  delaiSuppressionCapture: "delai_suppression_capture",
  confianceMinimaleLecture: "confiance_minimale_lecture",
  objectifTempsRemplissage: "objectif_temps_remplissage",
  toleranceGabarit: "tolerance_position_gabarit",
  toleranceMemeLigne: "tolerance_meme_ligne",
  dureeSessionMinimale: "duree_session_minimale",
  dureeSessionMaximale: "duree_session_maximale",
  cadenceMaximaleCourses: "cadence_maximale_courses",
  seuilPublication: "seuil_publication_statistiques",
  seuilPublicationSessions: "seuil_publication_sessions",
  seuilOutliers: "seuil_outliers_ecarts_types",
  retentionEmpreintes: "retention_empreintes",
  soumissionsParHeure: "soumissions_maximales_par_heure",
  soumissionsParJour: "soumissions_maximales_par_jour",
  echecsOcrAvantPause: "echecs_ocr_avant_pause",
  dureePauseApresEchecs: "duree_pause_apres_echecs",
} as const;

export const CLES_LEGALES = {
  tauxCotisations: "taux_cotisations_sociales",
} as const;

export const CLES_ANNONCEES = {
  garantieHoraire: "garantie_horaire_brute",
  minimumParCourse: "minimum_par_course",
  retraitFixe: "remuneration_retrait_fixe",
  remunerationParKm: "remuneration_par_km",
  remiseFixe: "remuneration_remise_fixe",
  fraisService: "frais_service",
} as const;

/**
 * Les regroupements de barèmes que le code désigne comme un tout.
 *
 * La grille kilométrique n'est pas une valeur mais quatre, et c'est leur
 * combinaison qui dit ce qu'une course aurait dû rapporter. Une classification
 * « sous la grille » ne se rattache donc à aucune des quatre en particulier :
 * elle se rattache au groupe.
 */
export const GROUPES_ANNONCES = {
  grilleKilometrique: "grille_kilometrique",
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
  secondes: "SECONDES",
  jours: "JOURS",
  kilooctets: "KILOOCTETS",
  megaoctets: "MEGAOCTETS",
  bits: "BITS",
  coursesParHeure: "COURSES_PAR_HEURE",
  courses: "COURSES",
  sessions: "SESSIONS",
} as const;

/**
 * Les valeurs que les textes publics citent, et le barème d'où chacune sort.
 *
 * La FAQ et les mentions légales annoncent des délais ; les y écrire en toutes
 * lettres donnerait deux vérités. Cette table est le seul endroit qui relie un
 * jeton de texte à un barème, et `tests/textes.test.mjs` vérifie dans les deux
 * sens : aucun jeton employé n'est absent d'ici, aucune clé nommée ici n'est
 * absente de la configuration.
 */
export const JETONS_TEXTE = {
  delai_suppression: CLES_SYSTEME.delaiSuppressionCapture,
  retention_empreintes: CLES_SYSTEME.retentionEmpreintes,
  objectif_remplissage: CLES_SYSTEME.objectifTempsRemplissage,
} as const;

/**
 * Les deux valeurs de type d'appareil, telles que le code les emploie.
 *
 * La déduction se fait sur une seule capacité du navigateur — un pointeur
 * grossier, c'est-à-dire un doigt. `tests/remplissage.test.mjs` vérifie que ces
 * deux valeurs sont exactement celles que la configuration déclare : le
 * formulaire ne peut donc pas envoyer un mot que la base refuserait.
 */
export const APPAREILS = {
  tactile: "mobile",
  autre: "ordinateur",
} as const;
