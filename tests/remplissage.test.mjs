/**
 * Tests du temps de remplissage.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Cette mesure est la seule donnee que le site collecte sur le geste du livreur
 * plutot que sur sa course. Deux garanties comptent, et aucune ne repose sur la
 * bonne volonte : elle ne peut pas faire rejeter une course, et elle ne peut pas
 * s'enrichir en douce d'un troisieme mot.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { APPAREILS } from "../lib/cles.ts";
import {
  analyserAppareil,
  analyserDureeRemplissage,
  resumerRemplissage,
} from "../lib/remplissage.ts";
import { CHAMPS_FACULTATIFS, CHAMPS_REQUIS } from "../lib/validation/soumission.ts";

const reglages = JSON.parse(await readFile("config/interface.json", "utf8"));
const APPAREILS_CONNUS = reglages.formulaire.appareils;

test("une duree absente, illisible ou absurde vaut null plutot que d'echouer", () => {
  /*
   * LA GARANTIE PRINCIPALE. Une mesure ratee ne doit pas couter sa course au
   * livreur : elle disparait, et l'envoi passe exactement comme avant.
   */
  for (const brut of [undefined, "", "   ", "vite", "0", "-12", "NaN", "Infinity"]) {
    assert.equal(analyserDureeRemplissage(brut), null, `« ${brut} » aurait du valoir null`);
  }

  assert.equal(analyserDureeRemplissage("74.5"), 74.5);
  assert.equal(analyserDureeRemplissage(" 90 "), 90);
});

test("une duree de remplissage ne peut pas produire d'erreur de champ", () => {
  /*
   * Structurel : le champ n'est ni requis ni facultatif au sens de l'analyse de
   * soumission — il n'y figure pas du tout. Il est lu a part, apres, et ne
   * participe donc a aucun verdict.
   */
  const champs = [...CHAMPS_REQUIS, ...CHAMPS_FACULTATIFS];

  assert.equal(champs.includes("duree_remplissage_secondes"), false);
  assert.equal(champs.includes("appareil"), false);
});

test("l'appareil ne peut valoir que l'un des deux mots declares", () => {
  assert.equal(analyserAppareil("mobile", APPAREILS_CONNUS), "mobile");
  assert.equal(analyserAppareil("ordinateur", APPAREILS_CONNUS), "ordinateur");

  for (const brut of [undefined, "", "iPhone 15 Pro", "tablette", "Mozilla/5.0"]) {
    assert.equal(analyserAppareil(brut, APPAREILS_CONNUS), null, `« ${brut} » aurait du etre refuse`);
  }
});

test("le code, la configuration et la base connaissent les memes appareils", async () => {
  const schema = await readFile("sql/schema.sql", "utf8");

  assert.deepEqual(Object.values(APPAREILS).sort(), [...APPAREILS_CONNUS].sort());

  for (const appareil of APPAREILS_CONNUS) {
    assert.ok(
      schema.includes(`'${appareil}'`),
      `appareil absent de la contrainte en base : ${appareil}`
    );
  }

  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));
  assert.deepEqual(Object.keys(libelles.appareils).sort(), [...APPAREILS_CONNUS].sort());
});

test("le resume rend une mediane par appareil, et la part sous l'objectif", () => {
  const mesures = [
    { appareil: "mobile", secondes: 60 },
    { appareil: "mobile", secondes: 80 },
    { appareil: "mobile", secondes: 200 },
    { appareil: "ordinateur", secondes: 40 },
  ];

  const resumes = resumerRemplissage(mesures, 90);

  assert.deepEqual(
    resumes.map((r) => r.appareil),
    ["mobile", "ordinateur"]
  );

  const mobile = resumes[0];
  assert.equal(mobile.effectif, 3);
  assert.equal(mobile.mediane, 80, "la mediane resiste a l'onglet laisse ouvert");
  assert.equal(Math.round(mobile.partSousObjectif), 67);

  assert.equal(resumes[1].mediane, 40);
  assert.equal(resumes[1].partSousObjectif, 100);
});

test("sans objectif en vigueur, aucune part n'est calculee", () => {
  /* Un objectif absent ne vaut pas zero : on ne compare a rien plutot que de
     comparer a une valeur inventee. */
  const resumes = resumerRemplissage([{ appareil: "mobile", secondes: 60 }], null);

  assert.equal(resumes[0].partSousObjectif, null);
  assert.equal(resumes[0].mediane, 60);
});

test("aucune mesure ne produit aucune ligne, pas une ligne a zero", () => {
  assert.deepEqual(resumerRemplissage([], 90), []);
});

test("l'objectif du dossier est un bareme de surveillance, pas de rejet", async () => {
  /*
   * Quatre-vingt-dix secondes depassees ne disent pas que la soumission est
   * mauvaise : elles disent que le formulaire l'est. Un usage de rejet ferait
   * de cette exigence, qui porte sur nous, un motif contre le livreur.
   */
  const baremes = JSON.parse(await readFile("config/baremes.json", "utf8"));
  const objectif = baremes.parametres_systeme.find(
    (entree) => entree.cle === "objectif_temps_remplissage" && entree.valable_au === null
  );

  assert.ok(objectif !== undefined, "l'objectif doit etre en vigueur");
  assert.equal(objectif.usage, "surveillance");
  assert.equal(objectif.unite, "SECONDES");
});
