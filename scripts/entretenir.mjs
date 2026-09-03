#!/usr/bin/env node
/**
 * Entretien : supprime les captures dont le delai est ecoule.
 *
 * Usage : node scripts/avec-env.mjs .env.local node scripts/entretenir.mjs
 *
 * A executer periodiquement. La logique vit dans lib/entretien.ts : quand le
 * site sera deploye, une tache planifiee appellera la meme fonction, sans
 * dupliquer quoi que ce soit.
 *
 * Ne rapporte que des comptes. Aucun contenu de capture ne passe par ici.
 */

import { readFile } from "node:fs/promises";

import { etatCaptures, supprimerCapturesEchues } from "../lib/entretien.ts";
import { uniqueEnVigueur } from "../lib/periodes.ts";

const maintenant = new Date();
const aujourdhui = maintenant.toISOString().slice(0, 10);

/* Le delai vient de la configuration datee, comme toute valeur du projet. */
const baremes = JSON.parse(
  await readFile(new URL("../config/baremes.json", import.meta.url), "utf8")
);

const delai =
  uniqueEnVigueur(
    baremes.parametres_systeme.filter((e) => e.cle === "delai_suppression_capture"),
    aujourdhui
  )?.valeur ?? null;

console.log(`Delai de suppression en vigueur : ${delai ?? "(non configure)"} heures\n`);

const avant = await etatCaptures(maintenant, delai);

if (avant === null) {
  console.error("Base indisponible : aucune suppression n'est possible.");
  process.exit(2);
}

console.log("Avant :");
for (const [etat, nombre] of Object.entries(avant)) console.log(`  ${etat.padEnd(20)} ${nombre}`);

const bilan = await supprimerCapturesEchues(maintenant, delai);

console.log(
  `\n${bilan.supprimees} capture(s) supprimee(s) sur ${bilan.examinees} echue(s)` +
    (bilan.echecs > 0 ? `, ${bilan.echecs} echec(s)` : "")
);

const apres = await etatCaptures(maintenant, delai);

console.log("\nApres :");
for (const [etat, nombre] of Object.entries(apres ?? {})) {
  console.log(`  ${etat.padEnd(20)} ${nombre}`);
}

if ((apres?.echues ?? 0) > 0) {
  console.error("\nDes captures restent echues : l'entretien n'a pas fait son travail.");
  process.exit(1);
}
