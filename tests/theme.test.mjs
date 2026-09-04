/**
 * Tests du theme : aucun widget nu, aucun style local qui reinvente.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Un select rendu par le systeme d'exploitation au milieu d'une page dessinee
 * dit « pas fini » avant que le premier mot ne soit lu. Et c'est le genre de
 * detail qui revient par oubli : une page ajoutee dans six mois, un champ copie
 * d'un exemple. La regle est donc verifiee, pas recommandee.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const fichiersTsx = async (racine) => {
  const trouves = [];

  const parcourir = async (dossier) => {
    for (const entree of await readdir(dossier, { withFileTypes: true })) {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) await parcourir(chemin);
      else if (entree.name.endsWith(".tsx")) trouves.push(chemin);
    }
  };

  await parcourir(racine);
  return trouves;
};

const sources = [];
for (const racine of ["app", "components"]) {
  for (const chemin of await fichiersTsx(racine)) {
    sources.push({ chemin, source: await readFile(chemin, "utf8") });
  }
}

/** Les classes du systeme qui habillent un widget. */
const CLASSES_SYSTEME = [
  "champ",
  "bouton-principal",
  "bouton-second",
  "bouton-fichier",
  "bouton-lien",
];

/* Un champ visuellement masque n'a pas d'apparence a habiller : le champ de
   fichier natif est cache derriere son propre bouton. */
const EXEMPTIONS = ["sr-only"];

test("aucun select, input ou button ne reste nu", () => {
  const nus = [];

  for (const { chemin, source } of sources) {
    for (const trouve of source.matchAll(/<(select|input|button)\b([^>]*)>/g)) {
      const [, balise, attributs] = trouve;

      const habille =
        CLASSES_SYSTEME.some((classe) => attributs.includes(classe)) ||
        EXEMPTIONS.some((classe) => attributs.includes(classe));

      if (!habille) {
        const ligne = source.slice(0, trouve.index).split("\n").length;
        nus.push(`${chemin}:${ligne} <${balise}>`);
      }
    }
  }

  assert.deepEqual(
    nus,
    [],
    `widget sans classe du theme — le rendu du systeme reapparaitrait :\n  ${nus.join("\n  ")}`
  );
});

test("le theme declare bien les classes que les pages emploient", async () => {
  /* L'inverse du test precedent : une classe employee mais jamais definie ne
     produit aucune erreur, seulement un element sans style. */
  const theme = await readFile("app/globals.css", "utf8");

  for (const classe of [...CLASSES_SYSTEME, "carte", "carte-accent", "etiquette-section",
                        "bandeau", "bandeau-chiffre", "puce-mesure", "puce-ecart",
                        "puce-declare", "chiffre", "chiffre-principal", "provenance"]) {
    assert.ok(
      theme.includes(`.${classe}`),
      `classe employee par les pages et absente du theme : ${classe}`
    );
  }
});

test("la palette declare les quatre roles, et rien d'autre", () => {
  /* Une couleur de plus est une semantique de moins : si tout peut alerter,
     plus rien n'alerte. */
  const attendus = [
    "--color-fond",
    "--color-encre",
    "--color-trait",
    "--color-mesure",
    "--color-mesure-clair",
    "--color-ecart",
    "--color-ecart-clair",
    "--color-declare",
    "--color-declare-clair",
  ];

  const theme = sources.length >= 0 ? null : null;
  assert.equal(theme, null);

  return readFile("app/globals.css", "utf8").then((source) => {
    const declarees = [...source.matchAll(/--color-[a-z-]+/g)].map((t) => t[0]);
    assert.deepEqual([...new Set(declarees)].sort(), [...attendus].sort());
  });
});
