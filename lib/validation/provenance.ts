/**
 * Contrôle des métadonnées de provenance.
 *
 * Les grands générateurs d'images inscrivent désormais leur origine dans le
 * fichier : type de source numérique IPTC, manifeste C2PA, nom du logiciel
 * créateur. Une capture fabriquée par l'un d'eux et soumise telle quelle porte
 * donc sa propre signature.
 *
 * Ce contrôle est délibérément facile à contourner : n'importe quel outil de
 * retouche efface ces métadonnées. Il n'est pas là pour arrêter un fraudeur
 * compétent, mais pour écarter les tentatives paresseuses, qui sont la majorité.
 * Ce qui protège vraiment les chiffres publiés, ce sont les statistiques
 * robustes — voir `lib/statistiques.ts`.
 *
 * Module pur : les marqueurs reconnus arrivent en paramètre, depuis
 * `config/provenance.json`.
 */

export interface ManifesteC2pa {
  emetteur: string | null;
  /** Type de source numérique déclaré par le manifeste, s'il en déclare un. */
  typeSourceNumerique: string | null;
}

export interface MetadonneesImage {
  /** Champ IPTC DigitalSourceType, sous forme d'URI. */
  typeSourceNumerique: string | null;
  /** EXIF Software ou XMP CreatorTool. */
  logiciel: string | null;
  manifestesC2pa: readonly ManifesteC2pa[];
}

export interface ReglesProvenance {
  /** URI IPTC qui désignent un contenu produit ou composé par un modèle. */
  typesSourceGenerative: readonly string[];
  /** Fragments de nom de logiciel, comparés sans tenir compte de la casse. */
  logicielsGeneratifs: readonly string[];
}

export const ORIGINES_PROVENANCE = [
  "type_source_numerique",
  "manifeste_c2pa",
  "logiciel_createur",
] as const;

export type OrigineProvenance = (typeof ORIGINES_PROVENANCE)[number];

export interface IndiceProvenance {
  origine: OrigineProvenance;
  /** Ce qui a été trouvé, tel quel, pour le tableau de surveillance. */
  valeur: string;
}

const estGenerative = (
  type: string | null,
  typesGeneratifs: readonly string[]
): type is string => type !== null && typesGeneratifs.includes(type);

const logicielGeneratif = (
  logiciel: string | null,
  fragments: readonly string[]
): string | null => {
  if (logiciel === null) return null;

  const normalise = logiciel.toLowerCase();
  const trouve = fragments.find((fragment) => normalise.includes(fragment.toLowerCase()));

  return trouve === undefined ? null : logiciel;
};

/**
 * `null` signifie « aucun indice de génération automatique », jamais « capture
 * authentique » : l'absence de métadonnées ne prouve rien.
 */
export const detecterProvenanceIa = (
  metadonnees: MetadonneesImage,
  regles: ReglesProvenance
): IndiceProvenance | null => {
  if (estGenerative(metadonnees.typeSourceNumerique, regles.typesSourceGenerative)) {
    return {
      origine: "type_source_numerique",
      valeur: metadonnees.typeSourceNumerique,
    };
  }

  for (const manifeste of metadonnees.manifestesC2pa) {
    if (estGenerative(manifeste.typeSourceNumerique, regles.typesSourceGenerative)) {
      return { origine: "manifeste_c2pa", valeur: manifeste.typeSourceNumerique };
    }
  }

  const logiciel = logicielGeneratif(metadonnees.logiciel, regles.logicielsGeneratifs);
  if (logiciel !== null) {
    return { origine: "logiciel_createur", valeur: logiciel };
  }

  return null;
};
