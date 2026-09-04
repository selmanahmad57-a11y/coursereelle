/**
 * Tests des proportions de la comparaison.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Un graphique ment de trois facons ordinaires : une echelle qui ne part pas de
 * zero, un minimum visuel qui donne du corps a une valeur nulle, et une
 * exageration de l'ecart. Les trois sont interdites ici, et les tests le
 * verifient — parce qu'un site qui reproche a d'autres de presenter leurs
 * chiffres avantageusement ne peut pas dessiner les siens de travers.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { manque, proportions } from "../lib/comparaison.ts";

test("la barre est exactement la valeur divisee par la plus grande", () => {
  const barres = proportions([
    { cle: "paye", valeur: 15.216 },
    { cle: "garantie", valeur: 19 },
  ]);

  assert.equal(barres[1].part, 100, "la plus grande occupe toute la longueur");
  assert.equal(barres[1].reference, true);
  assert.equal(barres[0].part.toFixed(2), "80.08");
  assert.equal(barres[0].reference, false);
});

test("une valeur double donne exactement une barre double", () => {
  const barres = proportions([
    { cle: "a", valeur: 10 },
    { cle: "b", valeur: 20 },
  ]);

  assert.equal(barres[0].part, 50);
  assert.equal(barres[1].part, 100);
});

test("aucun minimum visuel : une valeur minuscule reste minuscule", () => {
  /* Donner « un peu de corps » a une petite valeur est la facon la plus
     repandue de faire mentir un graphique sans mentir sur les nombres. */
  const barres = proportions([
    { cle: "miette", valeur: 0.01 },
    { cle: "gros", valeur: 100 },
  ]);

  assert.equal(barres[0].part, 0.01);
});

test("les valeurs inutilisables ne produisent pas de barre", () => {
  const barres = proportions([
    { cle: "absente", valeur: null },
    { cle: "nulle", valeur: 0 },
    { cle: "negative", valeur: -5 },
    { cle: "infinie", valeur: Number.POSITIVE_INFINITY },
    { cle: "bonne", valeur: 12 },
  ]);

  assert.deepEqual(
    barres.map((b) => b.cle),
    ["bonne"]
  );
  assert.equal(barres[0].part, 100);
});

test("sans aucune valeur utilisable, il n'y a pas de dessin", () => {
  /* Pas de barre vide, pas d'axe seul : rien. Comme partout ailleurs sur ce
     site, l'absence se montre en n'affichant pas. */
  assert.deepEqual(proportions([]), []);
  assert.deepEqual(proportions([{ cle: "rien", valeur: null }]), []);
});

test("le manque complete la barre jusqu'a la reference", () => {
  const [paye, garantie] = proportions([
    { cle: "paye", valeur: 15.216 },
    { cle: "garantie", valeur: 19 },
  ]);

  assert.equal(Number((paye.part + manque(paye)).toFixed(6)), 100);
  assert.equal(manque(garantie), 0, "la reference ne manque de rien");
});

test("l'alerte ne se declenche que sur un manque reel", async () => {
  /*
   * Sans cette condition, une course MIEUX payee que la garantie porterait la
   * couleur d'alerte : le manque serait du cote de l'annonce, et le dessin
   * signalerait un probleme la ou il n'y en a pas. Une alerte qui se declenche
   * sur un bon cas apprend au lecteur a l'ignorer, et ne sert plus a rien le
   * jour ou elle a raison.
   */
  const { enDeca } = await import("../lib/comparaison.ts");

  assert.equal(enDeca(15.22, 19), true, "paye en dessous du barème annonce");
  assert.equal(enDeca(21, 19), false, "mieux paye que le barème : aucune alerte");
  assert.equal(enDeca(19, 19), false, "conforme au barème : aucune alerte");
  assert.equal(enDeca(null, 19), false);
  assert.equal(enDeca(15.22, null), false, "sans barème annonce, rien a comparer");
});
