/**
 * Contrôles d'authenticité d'une capture, réunis en un seul point d'entrée.
 *
 * Trois contrôles, dans l'ordre du moins coûteux au plus coûteux :
 * provenance déclarée dans les métadonnées, similarité avec une capture déjà
 * reçue, conformité au gabarit du récapitulatif.
 *
 * Aucun des trois ne prouve qu'une capture est authentique, et ce module ne
 * prétend pas le contraire : ils écartent les tentatives paresseuses, qui sont
 * la majorité. Ce qui protège les chiffres publiés, ce sont les statistiques
 * robustes de `lib/statistiques.ts`, la limite de débit par appareil et le seuil
 * de publication. La page Méthode dit les deux choses publiquement.
 *
 * Module pur : règles, gabarits et seuils arrivent en paramètre.
 */

import { trouverSimilaires, type Similaire } from "./empreinte-image.ts";
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
  "capture_deja_soumise",
  "gabarit_non_reconnu",
] as const;

export type MotifAuthenticite = (typeof MOTIFS_AUTHENTICITE)[number];

export interface CaptureAControler {
  metadonnees: MetadonneesImage;
  /** Empreinte perceptuelle de l'image proposée. */
  empreinte: string;
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
  distancePerceptuelleMaximale: number | null;
}

export interface RefusAuthenticite {
  motif: MotifAuthenticite;
  provenance?: IndiceProvenance;
  similaires?: Similaire[];
  gabarit?: VerdictGabarit;
}

/** `null` signifie « aucun indice de fabrication », jamais « capture authentique ». */
export const controlerAuthenticite = (
  capture: CaptureAControler,
  regles: ReglesAuthenticite
): RefusAuthenticite | null => {
  const provenance = detecterProvenanceIa(capture.metadonnees, regles.provenance);
  if (provenance !== null) {
    return { motif: "provenance_ia", provenance };
  }

  const similaires = trouverSimilaires(
    capture.empreinte,
    capture.empreintesConnues,
    regles.distancePerceptuelleMaximale
  );
  if (similaires.length > 0) {
    return { motif: "capture_deja_soumise", similaires };
  }

  const gabarit = controlerGabarit(
    capture.plateforme,
    capture.textes,
    regles.gabarits,
    regles.toleranceGabarit
  );
  if (!gabarit.conforme) {
    return { motif: "gabarit_non_reconnu", gabarit };
  }

  return null;
};
