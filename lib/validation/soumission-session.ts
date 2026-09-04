/**
 * Lecture et contrôle des champs d'une soumission de session.
 *
 * Une session n'a pas de capture : rien ne la prouve, et c'est assumé — le temps
 * de connexion n'apparaît sur aucun récapitulatif. Elle est donc déclarative de
 * bout en bout, ce que la page Méthode annonce, et sa fiabilité vient du nombre
 * plutôt que de la preuve.
 *
 * Le reste suit exactement la discipline des courses : les vocabulaires arrivent
 * en paramètre, les motifs d'erreur sont ceux du module voisin — un formulaire
 * qui invente ses propres motifs finit par afficher des messages que personne
 * n'a traduits.
 */

import { analyserEntier, analyserNombre } from "../nombre.ts";
import { horodatagesSession } from "../calculs-session.ts";
import type { ErreurSoumission, Vocabulaires } from "./soumission.ts";

export const CHAMPS_REQUIS_SESSION = [
  "date_session",
  "plateforme",
  "heure_connexion",
  "heure_deconnexion",
  "nombre_courses",
  "revenu_total_euros",
] as const;

/*
 * Le véhicule et le temps en course sont facultatifs. Le premier ne change rien
 * au rapport que cette page mesure ; le second n'est pas donné par toutes les
 * applications, et l'exiger reviendrait à écarter les livreurs dont l'écran ne
 * l'affiche pas — c'est-à-dire à choisir l'échantillon.
 */
export const CHAMPS_FACULTATIFS_SESSION = ["vehicule", "minutes_en_course"] as const;

export interface SessionSoumise {
  dateSession: string;
  plateforme: string;
  vehicule: string | null;
  villeSlug: string | null;
  villeLibre: string | null;
  connexionLe: string;
  deconnexionLe: string;
  nombreCourses: number;
  revenuTotalEuros: number;
  minutesEnCourse: number | null;
}

export interface AnalyseSession {
  session: SessionSoumise | null;
  erreurs: ErreurSoumission[];
}

const FORMAT_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const FORMAT_HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const analyserSoumissionSession = (
  champs: Record<string, string | undefined>,
  vocabulaires: Vocabulaires
): AnalyseSession => {
  const erreurs: ErreurSoumission[] = [];

  for (const champ of CHAMPS_REQUIS_SESSION) {
    if (!champs[champ] || champs[champ]?.trim() === "") {
      erreurs.push({ champ, motif: "champ_absent" });
    }
  }

  const dateSession = champs.date_session?.trim() ?? "";
  if (dateSession !== "" && !FORMAT_DATE.test(dateSession)) {
    erreurs.push({ champ: "date_session", motif: "date_invalide" });
  }

  const connexion = champs.heure_connexion?.trim() ?? "";
  const deconnexion = champs.heure_deconnexion?.trim() ?? "";

  for (const [champ, valeur] of [
    ["heure_connexion", connexion],
    ["heure_deconnexion", deconnexion],
  ] as const) {
    if (valeur !== "" && !FORMAT_HEURE.test(valeur)) {
      erreurs.push({ champ, motif: "heure_invalide" });
    }
  }

  const nombreCourses = analyserEntier(champs.nombre_courses);
  if (champs.nombre_courses?.trim() !== "" && nombreCourses === null) {
    erreurs.push({ champ: "nombre_courses", motif: "nombre_invalide" });
  }

  const revenu = analyserNombre(champs.revenu_total_euros);
  if (champs.revenu_total_euros?.trim() !== "" && revenu === null) {
    erreurs.push({ champ: "revenu_total_euros", motif: "nombre_invalide" });
  }

  const minutesEnCourse = analyserNombre(champs.minutes_en_course);
  if (
    champs.minutes_en_course &&
    champs.minutes_en_course.trim() !== "" &&
    minutesEnCourse === null
  ) {
    erreurs.push({ champ: "minutes_en_course", motif: "nombre_invalide" });
  }

  const plateforme = champs.plateforme?.trim() ?? "";
  if (plateforme !== "" && !vocabulaires.plateformes.includes(plateforme)) {
    erreurs.push({ champ: "plateforme", motif: "valeur_hors_vocabulaire" });
  }

  const vehicule = champs.vehicule?.trim() ?? "";
  if (vehicule !== "" && !vocabulaires.vehicules.includes(vehicule)) {
    erreurs.push({ champ: "vehicule", motif: "valeur_hors_vocabulaire" });
  }

  const ville = champs.ville?.trim() ?? "";
  const villeLibre = champs.ville_libre?.trim() ?? "";
  let villeSlug: string | null = null;
  let libre: string | null = null;

  if (ville === "") {
    erreurs.push({ champ: "ville", motif: "ville_absente" });
  } else if (ville === vocabulaires.villeAutre) {
    if (villeLibre === "") {
      erreurs.push({ champ: "ville_libre", motif: "champ_absent" });
    } else {
      libre = villeLibre;
    }
  } else if (!vocabulaires.villes.includes(ville)) {
    erreurs.push({ champ: "ville", motif: "valeur_hors_vocabulaire" });
  } else {
    villeSlug = ville;
  }

  if (erreurs.length > 0) return { session: null, erreurs };

  /* Une déconnexion antérieure à la connexion signifie que la session a
     traversé minuit : le module de calcul ajoute le jour, le livreur n'a pas à
     y penser. */
  const horodatages = horodatagesSession(dateSession, connexion, deconnexion);

  if (horodatages === null) {
    return {
      session: null,
      erreurs: [{ champ: "heure_connexion", motif: "heure_invalide" }],
    };
  }

  return {
    session: {
      dateSession,
      plateforme,
      vehicule: vehicule === "" ? null : vehicule,
      villeSlug,
      villeLibre: libre,
      connexionLe: horodatages.connexionLe,
      deconnexionLe: horodatages.deconnexionLe,
      nombreCourses: nombreCourses as number,
      revenuTotalEuros: revenu as number,
      minutesEnCourse,
    },
    erreurs: [],
  };
};
