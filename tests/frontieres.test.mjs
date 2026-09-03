/**
 * La frontiere entre les donnees factices et la production.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * C'est le risque numero un du projet : un site de verite qui afficherait un
 * jour des chiffres inventes, meme par accident de deploiement, serait mort.
 *
 * Ce test ne repose donc sur aucune convention ni discipline : il lit le code
 * livre au navigateur et refuse toute importation de fixture depuis app/,
 * components/ ou lib/. Une fixture ne peut pas atteindre la production par
 * inadvertance, parce que le chemin d'importation lui-meme est interdit.
 *
 * Meme mecanisme que les colonnes proscrites du schema SQL : ce qui ne doit
 * jamais arriver est verifie, pas promis.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const racine = new URL("../", import.meta.url).pathname;

/* Les dossiers dont le contenu part chez le visiteur. */
const DOSSIERS_PRODUCTION = ["app", "components", "lib"];

/* Ce qu'aucun d'entre eux ne peut importer, sous aucun nom. */
const CHEMINS_INTERDITS = [
  /(^|\/)tests?(\/|$)/i,
  /fixtures?/i,
  /factice/i,
  /\bmocks?\b/i,
  /\bstubs?\b/i,
  /seed/i,
  /donnees-de-demo/i,
];

const listerFichiers = async (dossier) => {
  const entrees = await readdir(dossier, { withFileTypes: true });

  const resultats = await Promise.all(
    entrees.map(async (entree) => {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) return listerFichiers(chemin);
      return /\.(ts|tsx|mts|js|jsx|mjs)$/.test(entree.name) ? [chemin] : [];
    })
  );

  return resultats.flat();
};

const IMPORTATION = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

const importationsDe = (source) =>
  [...source.matchAll(IMPORTATION)].map((trouve) => trouve[1]);

test("aucun fichier de production n'importe de donnees factices", async () => {
  const fautes = [];

  for (const dossier of DOSSIERS_PRODUCTION) {
    for (const fichier of await listerFichiers(path.join(racine, dossier))) {
      const source = await readFile(fichier, "utf8");

      for (const specificateur of importationsDe(source)) {
        const interdit = CHEMINS_INTERDITS.find((motif) => motif.test(specificateur));

        if (interdit) {
          fautes.push(`${path.relative(racine, fichier)} importe « ${specificateur} »`);
        }
      }
    }
  }

  assert.deepEqual(
    fautes,
    [],
    "une fixture ne doit jamais pouvoir atteindre la production, meme par accident"
  );
});

test("les dossiers de production existent bien, sinon ce test ne verifie rien", async () => {
  /* Un test de frontiere qui ne lit aucun fichier passerait toujours. */
  for (const dossier of DOSSIERS_PRODUCTION) {
    const fichiers = await listerFichiers(path.join(racine, dossier));
    assert.ok(fichiers.length > 0, `${dossier}/ est vide : le controle serait vide aussi`);
  }
});

test("les fixtures existent, et elles vivent bien dans tests/", async () => {
  const fixtures = await listerFichiers(path.join(racine, "tests", "fixtures"));

  assert.ok(fixtures.length > 0, "les fixtures doivent exister quelque part, et c'est ici");

  for (const fichier of fixtures) {
    const source = await readFile(fichier, "utf8");
    assert.match(
      source,
      /DONNEES FACTICES/,
      `${path.relative(racine, fichier)} doit s'annoncer comme factice des sa premiere ligne`
    );
  }
});
