/**
 * Contrôles d'authenticité d'une capture, réunis en un seul point d'entrée.
 *
 * Trois contrôles : provenance déclarée dans les métadonnées, similarité avec
 * une capture déjà reçue, conformité au gabarit du récapitulatif.
 *
 * Aucun des trois ne prouve qu'une capture est authentique, et ce module ne
 * prétend pas le contraire : ils écartent les tentatives paresseuses, qui sont
 * la majorité. Ce qui protège les chiffres publiés, ce sont les statistiques
 * robustes de `lib/statistiques.ts`, la limite de débit par appareil et le seuil
 * de publication. La page Méthode dit les deux choses publiquement.
 *
 * ASYMÉTRIE DE CALIBRAGE, qui explique la forme du résultat renvoyé : un
 * contrôle peut REJETER ou seulement SIGNALER, et les deux ne se règlent pas de
 * la même façon. Un seuil qui rejette se tient au plus près du cas certain, et
 * ne s'élargit que sur mesure — un rejet à tort coûte une course légitime et un
 * livreur découragé. Un seuil qui signale peut être large dès le départ : il
 * remplit le tableau de surveillance et ne coûte rien au livreur légitime.
 *
 * Module pur : règles, gabarits et seuils arrivent en paramètre.
 */

import {
  classerSimilarites,
  type Similaire,
} from "./empreinte-image.ts";
import {
  controlerGabarit,
  type Gabarit,
  type TexteDetecte,
  type VerdictGabarit,
} from "./gabarit.ts";
import {
  detecterProvenanceIa,
  type IndiceProvenance,
  type MetadonneesImage,
  type ReglesProvenance,
} from "./provenance.ts";

export const MOTIFS_AUTHENTICITE = [
  "provenance_ia",
  "doublon_perceptuel",
  "gabarit_non_reconnu",
] as const;

export type MotifAuthenticite = (typeof MOTIFS_AUTHENTICITE)[number];

export const CODES_SIGNALEMENT = [
  "similarite_perceptuelle",
  "empreinte_sans_relief",
] as const;

export type CodeSignalement = (typeof CODES_SIGNALEMENT)[number];

export interface CaptureAControler {
  metadonnees: MetadonneesImage;
  /** Empreinte perceptuelle de l'image proposée. */
  empreinte: string;
  /** Combien de comparaisons de cette empreinte portent une information. */
  reliefEmpreinte: number;
  /** Empreintes des captures déjà reçues, pour la comparaison de similarité. */
  empreintesConnues: readonly string[];
  plateforme: string;
  /** Textes localisés rendus par le lecteur automatique. */
  textes: readonly TexteDetecte[];
}

export interface ReglesAuthenticite {
  provenance: ReglesProvenance;
  gabarits: readonly Gabarit[];
  toleranceGabarit: number | null;
  distancesPerceptuelles: { rejet: number | null; surveillance: number | null };
  reliefMinimal: number | null;
}

export interface RefusAuthenticite {
  motif: MotifAuthenticite;
  provenance?: IndiceProvenance;
  similaires?: Similaire[];
  gabarit?: VerdictGabarit;
}

export interface Signalement {
  code: CodeSignalement;
  /** La grandeur constatée : ici, la distance perceptuelle la plus faible. */
  valeur: number;
  /** À quoi la capture ressemble, pour pouvoir remonter au dossier. */
  reference: string;
}

export interface ResultatAuthenticite {
  /** null quand aucun contrôle n'a de raison certaine d'écarter la course. */
  refus: RefusAuthenticite | null;
  /** Journalisés pour le tableau de surveillance, sans effet sur la soumission. */
  signalements: Signalement[];
}

/**
 * `refus` à null signifie « aucun indice certain de fabrication », jamais
 * « capture authentique ».
 */
export const controlerAuthenticite = (
  capture: CaptureAControler,
  regles: ReglesAuthenticite
): ResultatAuthenticite => {
  const signalements: Signalement[] = [];

  const provenance = detecterProvenanceIa(capture.metadonnees, regles.provenance);
  if (provenance !== null) {
    return { refus: { motif: "provenance_ia", provenance }, signalements };
  }

  /*
   * Une empreinte sans relief ne conclut rien : elle ressemble a toutes les
   * autres empreintes sans relief. La comparer reviendrait a rejeter une course
   * legitime sur une mesure qui n'a rien mesure.
   */
  const conclut =
    regles.reliefMinimal === null || capture.reliefEmpreinte >= regles.reliefMinimal;

  if (!conclut) {
    signalements.push({
      code: "empreinte_sans_relief",
      valeur: capture.reliefEmpreinte,
      reference: capture.empreinte,
    });
  }

  const { identiques, aSurveiller } = conclut
    ? classerSimilarites(
        capture.empreinte,
        capture.empreintesConnues,
        regles.distancesPerceptuelles
      )
    : { identiques: [], aSurveiller: [] };

  if (aSurveiller.length > 0) {
    signalements.push({
      code: "similarite_perceptuelle",
      valeur: aSurveiller[0].distance,
      reference: aSurveiller[0].empreinte,
    });
  }

  if (identiques.length > 0) {
    return { refus: { motif: "doublon_perceptuel", similaires: identiques }, signalements };
  }

  const gabarit = controlerGabarit(
    capture.plateforme,
    capture.textes,
    regles.gabarits,
    regles.toleranceGabarit
  );

  if (!gabarit.conforme) {
    return { refus: { motif: "gabarit_non_reconnu", gabarit }, signalements };
  }

  return { refus: null, signalements };
};
