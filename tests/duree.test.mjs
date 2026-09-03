/**
 * Tests de la lecture des durees.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ce module existe a cause d'une soumission reelle perdue. Le recapitulatif
 * affiche « 16 min 34 s », le livreur a recopie « 16,34 », et la valeur est
 * partie telle quelle vers une colonne entiere : ecriture refusee, message
 * incomprehensible. Le format d'un champ doit accepter ce que les gens ecrivent,
 * pas ce qui arrange la base.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyserDuree, arrondirDuree } from "../lib/duree.ts";

const proche = (obtenu, attendu, tolerance = 0.0001) =>
  assert.ok(
    obtenu !== null && Math.abs(obtenu - attendu) <= tolerance,
    `attendu ${attendu}, obtenu ${obtenu}`
  );

test("un nombre simple est lu comme des minutes", () => {
  assert.equal(analyserDuree("16"), 16);
  assert.equal(analyserDuree(" 32 "), 32);
  assert.equal(analyserDuree("16 min"), 16);
});

test("les decimales sont acceptees, virgule comme point", () => {
  proche(analyserDuree("16,5"), 16.5);
  proche(analyserDuree("16.5"), 16.5);
});

test("la forme du recapitulatif est comprise telle qu'elle s'affiche", () => {
  /* Le cas qui a fait perdre une soumission. */
  proche(analyserDuree("16:34"), 16 + 34 / 60);
  proche(analyserDuree("16 min 34 s"), 16 + 34 / 60);
  proche(analyserDuree("16min34s"), 16 + 34 / 60);
  proche(analyserDuree("16m34"), 16 + 34 / 60);
  proche(analyserDuree("16 MIN 34"), 16 + 34 / 60);
});

test("les secondes doivent rester des secondes", () => {
  assert.equal(analyserDuree("16:74"), null, "74 secondes n'existe pas");
  assert.equal(analyserDuree("16:60"), null);
  proche(analyserDuree("16:59"), 16 + 59 / 60);
});

test("une saisie vide ou incomprehensible ne produit aucune valeur", () => {
  assert.equal(analyserDuree(""), null);
  assert.equal(analyserDuree("   "), null);
  assert.equal(analyserDuree(undefined), null);
  assert.equal(analyserDuree("bientot"), null);
  assert.equal(analyserDuree("16 34"), null, "sans separateur, l'intention est ambigue");
  assert.equal(analyserDuree("-5"), null);
});

test("aucune valeur approchee n'est inventee", () => {
  /* Mieux vaut un champ refuse qu'une duree fausse : elle alimente un taux horaire. */
  assert.equal(analyserDuree("environ 16"), null);
  assert.equal(analyserDuree("16 a 17"), null);
});

test("l'arrondi va a la seconde, pas au-dela", () => {
  proche(arrondirDuree(16 + 34 / 60), 16 + 34 / 60);
  assert.equal(arrondirDuree(16.000001), 16);
  assert.equal(arrondirDuree(30), 30);
});

test("la perte due au stockage decimal est plus petite qu'un centieme de seconde", () => {
  /*
   * Une duree en minutes decimales ne peut pas etre exacte : 34 secondes valent
   * 34/60 de minute, qui n'a pas d'ecriture decimale finie. La colonne
   * numeric(8,4) arrondit donc, et la question n'est pas « y a-t-il une perte »
   * mais « combien ». On la mesure plutot que de la nier.
   *
   * Seul un stockage en secondes entieres serait exact. Il ne l'a pas emporte :
   * tout le domaine raisonne en minutes, des seuils de configuration aux
   * calculs, et convertir partout couterait plus que ce que cette erreur vaut.
   */
  const PRECISION_COLONNE = 10_000;

  for (const saisie of ["16:34", "32:15", "8:07", "45:59"]) {
    const minutes = arrondirDuree(analyserDuree(saisie));
    const stockee = Math.round(minutes * PRECISION_COLONNE) / PRECISION_COLONNE;
    const perteEnSecondes = Math.abs(minutes - stockee) * 60;

    assert.ok(
      perteEnSecondes < 0.01,
      `${saisie} : perte de ${perteEnSecondes.toFixed(6)} s, trop grande`
    );
  }
});
