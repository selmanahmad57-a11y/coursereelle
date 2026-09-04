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
import { reglesTraitementDepuis } from "../lib/regles-traitement.ts";
import { traiterEnAttente } from "../lib/traitement-lecture.ts";

const racine = new URL("../", import.meta.url).pathname;
const lireJson = async (nom) => JSON.parse(await readFile(path.join(racine, nom), "utf8"));

const baremes = await lireJson("config/baremes.json");
const interfaceUber = await lireJson("config/interface-uber.json");
const captures = await lireJson("config/captures.json");

const aujourdhui = new Date().toISOString().slice(0, 10);

/* Les seuils sont assembles par le meme constructeur que la route periodique :
   deux consommateurs, une seule lecture de la configuration. */
const regles = reglesTraitementDepuis(baremes, interfaceUber, captures, aujourdhui);

console.log("Seuils en vigueur :");
console.log(`  confiance minimale de lecture : ${regles.lecture.confianceMinimale} %`);
console.log(`  tolerances : prix ${regles.tolerances.prixEuros}, distance ${regles.tolerances.distanceKm}, duree ${regles.tolerances.dureeEstimeeMinutes}\n`);

await demarrerLecteur(path.join(racine, "calibration"));

const taches = await lireJson("config/taches.json");
const limite = Number(process.argv[2] ?? taches.lecture.courses_par_passage);
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
