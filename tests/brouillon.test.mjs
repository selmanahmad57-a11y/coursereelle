/**
 * Tests du brouillon de saisie.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Un livreur a perdu huit champs sur un rechargement, après un envoi échoué.
 * « Personne ne répétera. » Ce module existe pour que cela n'arrive plus, et ses
 * tests portent sur le seul risque qui compte : qu'une donnée relue, abîmée ou
 * étrangère empêche de saisir.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BROUILLON_VIDE,
  brouillonRempli,
  decoderBrouillon,
} from "../lib/brouillon.ts";

test("un brouillon complet se relit tel quel", () => {
  const brouillon = {
    ...BROUILLON_VIDE,
    dateCourse: "2026-09-04",
    distance: "12,2",
    prixPaye: "8,08",
    dureeReelle: "32",
  };

  assert.deepEqual(decoderBrouillon(JSON.stringify(brouillon)), brouillon);
});

test("rien de ce qui vient du stockage ne peut casser le formulaire", () => {
  /*
   * Le contenu du stockage est une donnée, pas une promesse : une version
   * antérieure du site, une extension, un utilisateur curieux. Dans tous les
   * cas, le formulaire s'ouvre — vide s'il le faut, jamais cassé.
   */
  for (const brut of [
    null,
    "",
    "pas du json",
    "[]",
    "42",
    '"une chaine"',
    "null",
    '{"distance": 12}',
    '{"distance": null, "inconnu": "x"}',
  ]) {
    const relu = decoderBrouillon(brut);

    assert.equal(typeof relu, "object");
    for (const [champ, valeur] of Object.entries(relu)) {
      assert.equal(typeof valeur, "string", `${champ} devrait être une chaîne`);
    }
  }
});

test("une clé absente rend une chaîne vide, jamais undefined", () => {
  /* Un champ contrôlé qui reçoit undefined passe en non contrôlé, et React s'en
     plaint à la première frappe. */
  const relu = decoderBrouillon('{"distance": "3"}');

  assert.equal(relu.distance, "3");
  assert.equal(relu.prixPaye, "");
  assert.deepEqual(Object.keys(relu).sort(), Object.keys(BROUILLON_VIDE).sort());
});

test("un brouillon vide ne se propose pas", () => {
  /* Annoncer « vos saisies ont été conservées » devant un formulaire vide serait
     une promesse sans objet. */
  assert.equal(brouillonRempli(BROUILLON_VIDE), false);
  assert.equal(brouillonRempli({ ...BROUILLON_VIDE, distance: "   " }), false);
  assert.equal(brouillonRempli({ ...BROUILLON_VIDE, distance: "12,2" }), true);
});
