#!/usr/bin/env node
/**
 * Verifie que chaque secret arrive intact jusqu'a l'application.
 *
 * Usage : node scripts/verifier-env.mjs [fichier-env]
 *
 * Raison d'etre, decouverte a la dure : le chargeur d'environnement de Next
 * effectue une EXPANSION DE VARIABLES. Un mot de passe contenant un « $ » est
 * donc silencieusement ampute — « abc$DEF-ghi » devient « abc-ghi » — sans le
 * moindre avertissement. Ni les guillemets simples ni les doubles n'y changent
 * quoi que ce soit : seul un « \$ » echappe survit.
 *
 * L'echec est particulierement vicieux parce qu'il ne ressemble pas a ce qu'il
 * est : on croit a un mot de passe refuse, a des droits mal regles, a un cookie
 * mal pose. Ce script transforme donc une enquete en une ligne de sortie.
 *
 * Aucune valeur n'est affichee : seulement des noms, des longueurs, des verdicts.
 */

import { readFile } from "node:fs/promises";
import env from "@next/env";

const fichier = process.argv[2] ?? ".env.local";

let contenu;
try {
  contenu = await readFile(fichier, "utf8");
} catch {
  console.error(`Fichier introuvable : ${fichier}`);
  process.exit(2);
}

/** Lecture litterale : separation au premier « = », guillemets exterieurs retires. */
const valeursDuFichier = new Map();

for (const ligne of contenu.split("\n")) {
  const nettoyee = ligne.trim();
  if (nettoyee === "" || nettoyee.startsWith("#")) continue;

  const separateur = nettoyee.indexOf("=");
  if (separateur === -1) continue;

  const nom = nettoyee.slice(0, separateur).trim();
  let valeur = nettoyee.slice(separateur + 1).trim();

  if (
    (valeur.startsWith('"') && valeur.endsWith('"')) ||
    (valeur.startsWith("'") && valeur.endsWith("'"))
  ) {
    valeur = valeur.slice(1, -1);
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) valeursDuFichier.set(nom, valeur);
}

/* On efface d'abord, pour que la lecture de Next ne soit pas masquee par
   d'eventuelles valeurs deja presentes dans l'environnement. */
for (const nom of valeursDuFichier.keys()) delete process.env[nom];

env.loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} });

const abimees = [];
const vides = [];

for (const [nom, brute] of valeursDuFichier) {
  const vue = process.env[nom];

  /* Un « \$ » deja echappe dans le fichier doit arriver comme un « $ » simple. */
  const attendue = brute.replaceAll("\\$", "$");

  if (brute === "") {
    vides.push(nom);
    console.log(`  vide     ${nom}`);
    continue;
  }

  if (vue === attendue) {
    console.log(`  intacte  ${nom.padEnd(32)} ${attendue.length} caracteres`);
  } else {
    abimees.push(nom);
    console.log(
      `  ABIMEE   ${nom.padEnd(32)} ${attendue.length} caracteres ecrits, ${vue?.length ?? 0} recus`
    );
  }
}

console.log("");

if (vides.length > 0) {
  console.log(`${vides.length} variable(s) non renseignee(s) : ${vides.join(", ")}`);
}

if (abimees.length === 0) {
  console.log("Toutes les valeurs renseignees arrivent intactes.");
  process.exit(0);
}

console.error(
  `${abimees.length} valeur(s) alteree(s) : ${abimees.join(", ")}\n\n` +
    "Cause la plus frequente : un « $ » dans la valeur, interprete comme une variable.\n" +
    "Correction : echapper chaque « $ » en « \\$ » dans le fichier, ou choisir une\n" +
    "valeur qui n'en contient pas. Les guillemets ne protegent pas."
);
process.exit(1);
