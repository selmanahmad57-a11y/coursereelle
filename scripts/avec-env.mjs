#!/usr/bin/env node
/**
 * Lance une commande avec les variables de .env.local chargées.
 *
 * Usage : node scripts/avec-env.mjs <fichier-env> <commande> [arguments...]
 *
 * Raison d'être : un fichier d'environnement ne peut pas toujours être « sourcé »
 * par le shell — une valeur contenant &, $ ou une espace suffit à le casser, et
 * la corriger à la main reviendrait à manipuler des secrets en ligne de commande.
 * Ce lanceur les lit, les passe à l'enfant, et ne les écrit jamais nulle part.
 *
 * Aucune valeur n'est affichée, ni en cas de succès ni en cas d'erreur.
 */

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const [fichier, commande, ...arguments_] = process.argv.slice(2);

if (!fichier || !commande) {
  console.error("Usage : node scripts/avec-env.mjs <fichier-env> <commande> [arguments...]");
  process.exit(2);
}

const contenu = await readFile(fichier, "utf8");
const variables = {};

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

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) variables[nom] = valeur;
}

const enfant = spawn(commande, arguments_, {
  env: { ...process.env, ...variables },
  stdio: "inherit",
});

enfant.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
