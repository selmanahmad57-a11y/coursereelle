/**
 * Le moteur de lecture, branche derriere le contrat.
 *
 * Tesseract rend du texte ; ce module le convertit en zones lues et le passe a
 * `lib/lecture-capture.ts`, qui en tire des nombres. Le texte ne franchit pas
 * cette frontiere : rien de ce qui est renvoye ici ne contient de chaine issue
 * de l'image.
 *
 * Un seul travailleur est cree et reutilise : l'initialisation coute environ une
 * seconde et n'a aucune raison d'etre payee a chaque capture.
 */

import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

import type { ZoneLue } from "./lecture-capture.ts";

/* La langue et le cache sont des choix de deploiement, pas des reglages metier. */
const LANGUE = "fra";

let travailleur: Worker | null = null;

export const demarrerLecteur = async (cheminCache: string): Promise<void> => {
  travailleur ??= await createWorker(LANGUE, 1, { cachePath: cheminCache, logger: () => {} });
};

export const arreterLecteur = async (): Promise<void> => {
  if (travailleur === null) return;
  await travailleur.terminate();
  travailleur = null;
};

/**
 * Les zones lues : mots isoles ET lignes reconstituees. Les deux sont
 * necessaires — un montant est souvent coupe en deux mots, et le recapitulatif
 * met duree et distance sur une meme ligne.
 */
export const zonesLues = async (image: Uint8Array<ArrayBuffer>): Promise<ZoneLue[]> => {
  if (travailleur === null) throw new Error("Lecteur non demarre.");

  /* Niveaux de gris et redressement du contraste : ce que Tesseract prefere. */
  const preparee = await sharp(image).greyscale().normalise().toBuffer();

  const { data } = await travailleur.recognize(preparee, {}, { tsv: true });

  const zones: ZoneLue[] = [];
  const parLigne = new Map<string, { textes: string[]; confiances: number[] }>();

  for (const ligne of (data.tsv ?? "").split("\n").slice(1)) {
    const colonnes = ligne.split("\t");
    if (colonnes[0] !== "5") continue;

    const texte = (colonnes[11] ?? "").trim();
    if (texte === "") continue;

    const confiance = Number(colonnes[10]);
    zones.push({ texte, confiance });

    const cle = `${colonnes[2]}-${colonnes[3]}-${colonnes[4]}`;
    const groupe = parLigne.get(cle) ?? { textes: [], confiances: [] };
    groupe.textes.push(texte);
    groupe.confiances.push(confiance);
    parLigne.set(cle, groupe);
  }

  for (const groupe of parLigne.values()) {
    /* On note ou chaque mot commence dans la ligne reconstituee : la confiance
       d'une valeur sera celle des mots qu'elle recouvre, pas celle de la ligne. */
    const mots: { debut: number; fin: number; confiance: number }[] = [];
    let position = 0;

    for (const [index, mot] of groupe.textes.entries()) {
      mots.push({ debut: position, fin: position + mot.length, confiance: groupe.confiances[index] });
      position += mot.length + 1;
    }

    zones.push({
      texte: groupe.textes.join(" "),
      confiance: Math.min(...groupe.confiances),
      mots,
    });
  }

  return zones;
};
