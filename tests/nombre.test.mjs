/**
 * Tests de la lecture des nombres.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Meme lecon que les durees, apprise une seconde fois : un champ doit accepter
 * ce que les gens ecrivent. Quelqu'un qui lit « 8,08 € » sur son ecran recopie
 * « 8,08 € », et le refuser fait perdre la course.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyserEntier, analyserNombre } from "../lib/nombre.ts";

test("les formes de base sont comprises", () => {
  assert.equal(analyserNombre("8.08"), 8.08);
  assert.equal(analyserNombre("8,08"), 8.08);
  assert.equal(analyserNombre("12"), 12);
  assert.equal(analyserNombre(" 12,2 "), 12.2);
});

test("l'unite recopiee depuis l'ecran ne fait pas perdre la saisie", () => {
  assert.equal(analyserNombre("8,08 €"), 8.08);
  assert.equal(analyserNombre("8,08€"), 8.08);
  assert.equal(analyserNombre("12,2 km"), 12.2);
  assert.equal(analyserNombre("12 km"), 12);
  assert.equal(analyserNombre("21,2 %"), 21.2);
  assert.equal(analyserNombre("8.08 EUR"), 8.08);
});

test("les separateurs de milliers francais sont acceptes", () => {
  /* Espace ordinaire, insecable et fine insecable : les trois circulent. */
  assert.equal(analyserNombre("1 234,56"), 1234.56);
  assert.equal(analyserNombre("1 234,56 €"), 1234.56);
  assert.equal(analyserNombre("1 234,56"), 1234.56);
});

test("un signe plus explicite ne gene pas", () => {
  assert.equal(analyserNombre("+8,08"), 8.08);
  assert.equal(analyserNombre("+8,08 €"), 8.08);
});

test("ce qui n'est pas un nombre unique est refuse, jamais approche", () => {
  /* Une valeur inventee alimenterait un taux horaire faux. */
  for (const saisie of ["", "   ", "environ 8", "8 a 9", "8/10", "huit", "-5", "8,0,8", "."]) {
    assert.equal(analyserNombre(saisie), null, `« ${saisie} » doit etre refuse`);
  }
  assert.equal(analyserNombre(undefined), null);
});

test("un compte refuse les fractions", () => {
  assert.equal(analyserEntier("7"), 7);
  assert.equal(analyserEntier("7 courses"), 7);
  assert.equal(analyserEntier("7,5"), null, "sept courses et demie n'existent pas");
});
