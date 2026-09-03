#!/usr/bin/env node
/**
 * Filtre 2 : lit les captures des courses en attente et rend un verdict.
 *
 * Usage : npm run lecture
 *
 * La logique vit dans lib/traitement-lecture.ts. Ce script n'est qu'un
 * declencheur : quand le site sera deploye, une tache planifiee appellera la
 * meme fonction, sans dupliquer quoi que ce soit.
 *
 * N'affiche que des nombres et des verdicts. Aucun texte lu sur une capture ne
 * passe par ici.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { arreterLecteur, demarrerLecteur } from "../lib/ocr-tesseract.ts";
import { reglesClassificationDepuis } from "../lib/classification-regles.ts";
import { uniqueEnVigueur } from "../lib/periodes.ts";
import { traiterEnAttente } from "../lib/traitement-lecture.ts";

const racine = new URL("../", import.meta.url).pathname;
const lireJson = async (nom) => JSON.parse(await readFile(path.join(racine, nom), "utf8"));

const baremes = await lireJson("config/baremes.json");
const interfaceUber = await lireJson("config/interface-uber.json");
const captures = await lireJson("config/captures.json");

const aujourdhui = new Date().toISOString().slice(0, 10);

const valeur = (cle) =>
  uniqueEnVigueur(
    baremes.parametres_systeme.filter((entree) => entree.cle === cle),
    aujourdhui
  )?.valeur ?? null;

/* La note explicative et le nom du champ indispensable vivent a cote de la
   correspondance champ -> motif : on les met de cote avant de la parcourir. */
const parChamp = Object.fromEntries(
  Object.entries(interfaceUber.champs_verifiables).filter(
    ([cle]) => cle !== "note" && cle !== "indispensable"
  )
);

const motifs = Object.fromEntries(
  Object.entries(parChamp).map(([champ, nom]) => [champ, interfaceUber.motifs[nom]])
);

const regles = {
  lecture: { motifs, confianceMinimale: valeur("confiance_minimale_lecture") ?? 0 },
  tolerances: {
    prixEuros: valeur("tolerance_ocr_prix"),
    distanceKm: valeur("tolerance_ocr_distance"),
    dureeEstimeeMinutes: valeur("tolerance_ocr_duree_estimee"),
  },
  champsFacultatifs: captures.politique_verification.declaratifs,
  champsProbants: captures.politique_verification.probants,
  /* La classification consulte les mêmes barèmes que la page qui les affiche,
     par la même fonction : deux consommateurs, une seule vérité. */
  reglesClassification: (date, contexte) => reglesClassificationDepuis(baremes, date, contexte),
};

console.log("Seuils en vigueur :");
console.log(`  confiance minimale de lecture : ${regles.lecture.confianceMinimale} %`);
console.log(`  tolerances : prix ${regles.tolerances.prixEuros}, distance ${regles.tolerances.distanceKm}, duree ${regles.tolerances.dureeEstimeeMinutes}\n`);

await demarrerLecteur(path.join(racine, "calibration"));

const limite = Number(process.argv[2] ?? 20);
const verdicts = await traiterEnAttente(regles, limite);

await arreterLecteur();

if (verdicts.length === 0) {
  console.log("Aucune course en attente de lecture.");
  process.exit(0);
}

for (const verdict of verdicts) {
  console.log(`  ${verdict.id.slice(0, 8)}  ->  ${verdict.statut}${verdict.motif ? ` (${verdict.motif})` : ""}`);
  for (const classement of verdict.classements ?? []) {
    console.log(
      `      classe ${classement.categorie}` +
        (classement.valeurBareme === null
          ? ""
          : ` (annonce ${classement.valeurBareme.toFixed(2)}, constate ${classement.valeurConstatee.toFixed(2)})`)
    );
  }
  for (const [champ, lue] of Object.entries(verdict.valeurs)) {
    const confiance = verdict.confiances[champ];
    console.log(
      `      ${champ.padEnd(20)} lu ${String(lue === null ? "(rien)" : lue).padEnd(8)}` +
        `${(confiance === null ? "" : `confiance ${Math.round(confiance)}`).padEnd(14)}` +
        verdict.statutsLecture[champ]
    );
  }
}

const valides = verdicts.filter((v) => v.statut === "validee_auto").length;
console.log(`\n${valides} validee(s), ${verdicts.length - valides} rejetee(s).`);
