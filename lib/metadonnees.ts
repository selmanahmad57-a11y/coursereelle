/**
 * Lecture des metadonnees de provenance d'une image.
 *
 * Seul le bloc XMP est inspecte pour l'instant : c'est la qu'ecrivent les
 * generateurs qui declarent leur origine, et c'est du XML lisible sans
 * dependance supplementaire. Les champs EXIF binaires demanderaient un analyseur
 * complet, pour un gain nul tant que la liste des logiciels generatifs est vide.
 *
 * Module pur : il recoit du texte, jamais un fichier.
 */

import type { MetadonneesImage } from "./validation/provenance.ts";

const premier = (texte: string, motifs: RegExp[]): string | null => {
  for (const motif of motifs) {
    const trouve = texte.match(motif);
    if (trouve?.[1]) return trouve[1].trim();
  }
  return null;
};

export const extraireProvenance = (xmp: string | null): MetadonneesImage => {
  if (!xmp) return { typeSourceNumerique: null, logiciel: null, manifestesC2pa: [] };

  const typeSourceNumerique = premier(xmp, [
    /DigitalSourceType\s*=\s*"([^"]+)"/i,
    /<[^>]*DigitalSourceType[^>]*>([^<]+)</i,
  ]);

  const logiciel = premier(xmp, [
    /CreatorTool\s*=\s*"([^"]+)"/i,
    /<[^>]*CreatorTool[^>]*>([^<]+)</i,
    /Software\s*=\s*"([^"]+)"/i,
  ]);

  /* Un manifeste C2PA reference dans le XMP porte souvent son propre type de
     source. On le remonte tel quel : c'est au module de provenance de juger. */
  const manifestes = [...xmp.matchAll(/<[^>]*c2pa[^>]*>([^<]*)</gi)]
    .map((trouve) => trouve[1].trim())
    .filter((valeur) => valeur !== "")
    .map((valeur) => ({ emetteur: null, typeSourceNumerique: valeur }));

  return { typeSourceNumerique, logiciel, manifestesC2pa: manifestes };
};
