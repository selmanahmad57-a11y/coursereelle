/**
 * Empreintes d'une capture.
 *
 * Deux empreintes complementaires : l'exacte, qui refuse deux fois le meme
 * fichier, et la perceptuelle, qui reconnait la meme capture recadree ou
 * eclaircie. Le calcul perceptuel lui-meme vit dans un module pur ; ici on ne
 * fait que reduire l'image en niveaux de gris pour le nourrir.
 */

import sharp from "sharp";

import { empreinteImage, reliefEmpreinte } from "./validation/empreinte-image.ts";
import { extraireProvenance } from "./metadonnees.ts";
import type { MetadonneesImage } from "./validation/provenance.ts";

/*
 * Le type precise ArrayBuffer plutot que ArrayBufferLike : l'API de hachage du
 * navigateur refuse une vue sur memoire partagee, et l'ecrire ici evite un
 * transtypage a chaque appel.
 */
export type OctetsImage = Uint8Array<ArrayBuffer>;

/* Huit lignes de neuf colonnes : une empreinte de soixante-quatre bits. */
const LIGNES = 8;
const COLONNES = 9;

export const empreinteExacte = async (donnees: OctetsImage): Promise<string> => {
  const condensat = await crypto.subtle.digest("SHA-256", donnees);
  return Array.from(new Uint8Array(condensat))
    .map((octet) => octet.toString(16).padStart(2, "0"))
    .join("");
};

export interface EmpreintePerceptuelle {
  empreinte: string;
  /** Comparaisons porteuses d'information : dit si l'empreinte conclut quelque chose. */
  relief: number;
}

export const empreinteAppariee = async (
  donnees: OctetsImage
): Promise<EmpreintePerceptuelle> => {
  const { data } = await sharp(donnees)
    .greyscale()
    .resize(COLONNES, LIGNES, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const luminances = Array.from({ length: LIGNES }, (_, ligne) =>
    Array.from(data.subarray(ligne * COLONNES, (ligne + 1) * COLONNES))
  );

  return { empreinte: empreinteImage(luminances), relief: reliefEmpreinte(luminances) };
};

export const metadonneesProvenance = async (
  donnees: OctetsImage
): Promise<MetadonneesImage> => {
  try {
    const donneesImage = await sharp(donnees).metadata();
    const xmp = donneesImage.xmp ? Buffer.from(donneesImage.xmp).toString("utf8") : null;
    return extraireProvenance(xmp);
  } catch {
    /* Une image dont les metadonnees sont illisibles n'est pas une image suspecte :
       l'absence d'indice ne prouve rien, dans un sens comme dans l'autre. */
    return { typeSourceNumerique: null, logiciel: null, manifestesC2pa: [] };
  }
};

export const imageLisible = async (donnees: OctetsImage): Promise<boolean> => {
  try {
    const { width, height } = await sharp(donnees).metadata();
    return Boolean(width && height);
  } catch {
    return false;
  }
};
