/**
 * Tests du remplissage des modeles de calcul.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ces modeles ecrivent, a cote de chaque chiffre, d'ou il sort. Un calcul a
 * trous serait pire que pas de calcul du tout : le but est de lever un doute,
 * pas d'en creer un.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { remplir } from "../lib/modeles.ts";

test("un modele dont toutes les variables sont connues est rendu", () => {
  assert.equal(
    remplir("{prix} en {duree}", { prix: "8,08 €", duree: "30 min" }),
    "8,08 € en 30 min"
  );
});

test("une seule variable manquante suffit a ne rien rendre", () => {
  assert.equal(remplir("{prix} en {duree}", { prix: "8,08 €", duree: null }), null);
  assert.equal(remplir("{prix} en {duree}", { prix: null, duree: "30 min" }), null);
});

test("les variables en trop sont ignorees", () => {
  assert.equal(
    remplir("{prix}", { prix: "8,08 €", pourboire: null, distance: null }),
    "8,08 €",
    "une valeur inconnue n'empeche rien si le modele ne la demande pas"
  );
});

test("une variable repetee est remplacee partout", () => {
  assert.equal(remplir("{a} puis {a}", { a: "x" }), "x puis x");
});

test("un modele qui demande une variable jamais fournie ne rend rien", () => {
  /* Un modele et son appelant desaccordes : mieux vaut ne rien afficher que
     laisser une accolade a l'ecran. */
  assert.equal(remplir("{prix} en {duree}", { prix: "8,08 €" }), null);
});

test("un modele sans variable est rendu tel quel", () => {
  assert.equal(remplir("texte fixe", {}), "texte fixe");
});
