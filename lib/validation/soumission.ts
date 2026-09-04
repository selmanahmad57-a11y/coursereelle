/**
 * Lecture et contrôle des champs d'une soumission de course.
 *
 * Cette couche ne juge rien : elle vérifie que ce qui arrive est bien du type
 * annoncé et fait partie des vocabulaires que la configuration connaît. Les
 * filtres, eux, viennent après.
 *
 * Le contrôle est refait côté serveur intégralement : le formulaire prévient le
 * livreur, il ne protège rien.
 *
 * Module pur : les vocabulaires arrivent en paramètre, depuis la configuration.
 */

import { analyserDuree, arrondirDuree } from "../duree.ts";
import { analyserNombre } from "../nombre.ts";

export const CHAMPS_REQUIS = [
  "date_course",
  "plateforme",
  "vehicule",
  "distance_km",
  "prix_paye_euros",
  "duree_reelle_minutes",
] as const;

/*
 * La durée affichée par l'application est facultative : l'écran d'acceptation ne
 * la montre pas, et un livreur ne la note pas toujours. Mieux vaut une course
 * sans comparateur qu'une course perdue.
 */
export const CHAMPS_FACULTATIFS = ["duree_estimee_minutes", "pourboire_euros"] as const;

export const MOTIFS_SOUMISSION = [
  "champ_absent",
  "nombre_invalide",
  "duree_invalide",
  "heure_invalide",
  "date_invalide",
  "valeur_hors_vocabulaire",
  "ville_absente",
] as const;

export type MotifSoumission = (typeof MOTIFS_SOUMISSION)[number];

export interface ErreurSoumission {
  champ: string;
  motif: MotifSoumission;
}

export interface Vocabulaires {
  plateformes: readonly string[];
  vehicules: readonly string[];
  villes: readonly string[];
  /** Valeur réservée du sélecteur pour une ville hors liste. */
  villeAutre: string;
}

export interface CourseSoumise {
  dateCourse: string;
  plateforme: string;
  vehicule: string;
  villeSlug: string | null;
  villeLibre: string | null;
  distanceKm: number;
  prixPayeEuros: number;
  pourboireEuros: number | null;
  dureeEstimeeMinutes: number | null;
  dureeReelleMinutes: number;
}

export interface Analyse {
  course: CourseSoumise | null;
  erreurs: ErreurSoumission[];
}

const FORMAT_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/* La lecture tolérante vit dans son propre module, partagée avec le formulaire :
   les deux côtés doivent comprendre exactement la même chose. */
const enNombre = analyserNombre;

export const analyserSoumissionCourse = (
  champs: Record<string, string | undefined>,
  vocabulaires: Vocabulaires
): Analyse => {
  const erreurs: ErreurSoumission[] = [];

  for (const champ of CHAMPS_REQUIS) {
    if (!champs[champ] || champs[champ]?.trim() === "") {
      erreurs.push({ champ, motif: "champ_absent" });
    }
  }

  const dateCourse = champs.date_course?.trim() ?? "";
  if (dateCourse !== "" && !FORMAT_DATE.test(dateCourse)) {
    erreurs.push({ champ: "date_course", motif: "date_invalide" });
  }

  const nombres: Record<string, number | null> = {
    distance_km: enNombre(champs.distance_km),
    prix_paye_euros: enNombre(champs.prix_paye_euros),
  };

  for (const [champ, valeur] of Object.entries(nombres)) {
    if (champs[champ] && champs[champ]?.trim() !== "" && valeur === null) {
      erreurs.push({ champ, motif: "nombre_invalide" });
    }
  }

  /* Les durées ont leur propre lecture : « 16:34 » et « 16 min 34 s » sont des
     formes que les livreurs écrivent réellement, et « 16 » aussi. */
  const durees: Record<string, number | null> = {
    duree_estimee_minutes: analyserDuree(champs.duree_estimee_minutes),
    duree_reelle_minutes: analyserDuree(champs.duree_reelle_minutes),
  };

  for (const [champ, valeur] of Object.entries(durees)) {
    if (champs[champ] && champs[champ]?.trim() !== "" && valeur === null) {
      erreurs.push({ champ, motif: "duree_invalide" });
    }
  }

  const pourboire = enNombre(champs.pourboire_euros);
  if (champs.pourboire_euros && champs.pourboire_euros.trim() !== "" && pourboire === null) {
    erreurs.push({ champ: "pourboire_euros", motif: "nombre_invalide" });
  }

  const plateforme = champs.plateforme?.trim() ?? "";
  if (plateforme !== "" && !vocabulaires.plateformes.includes(plateforme)) {
    erreurs.push({ champ: "plateforme", motif: "valeur_hors_vocabulaire" });
  }

  const vehicule = champs.vehicule?.trim() ?? "";
  if (vehicule !== "" && !vocabulaires.vehicules.includes(vehicule)) {
    erreurs.push({ champ: "vehicule", motif: "valeur_hors_vocabulaire" });
  }

  /* La ville est soit un slug connu, soit une saisie libre explicitement
     assumée. Un slug inconnu est refusé : les statistiques par ville exigent
     des libellés stables. */
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

  if (erreurs.length > 0) return { course: null, erreurs };

  return {
    course: {
      dateCourse,
      plateforme,
      vehicule,
      villeSlug,
      villeLibre: libre,
      distanceKm: nombres.distance_km as number,
      prixPayeEuros: nombres.prix_paye_euros as number,
      pourboireEuros: pourboire,
      dureeEstimeeMinutes:
        durees.duree_estimee_minutes === null
          ? null
          : arrondirDuree(durees.duree_estimee_minutes),
      dureeReelleMinutes: arrondirDuree(durees.duree_reelle_minutes as number),
    },
    erreurs: [],
  };
};
