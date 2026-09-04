/**
 * Tests du tri du registre.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Le tri vient de l'URL, et l'ordre d'une requête SQL ne peut pas être passé en
 * paramètre : c'est le seul endroit du site où une valeur du visiteur pourrait,
 * par négligence, devenir du code. Elle ne le peut pas — mais cela se vérifie,
 * cela ne se promet pas.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { TRIS, TRI_PAR_DEFAUT, triValide } from "../lib/tri-courses.ts";

test("toute valeur inattendue retombe sur l'ordre par defaut", () => {
  const hostiles = [
    undefined,
    "",
    "prix",
    "date; drop table courses",
    "1 union select",
    "DATE",
    "conformite ",
    "../date",
  ];

  for (const brut of hostiles) {
    assert.equal(triValide(brut), TRI_PAR_DEFAUT, `« ${brut} » aurait du retomber sur la date`);
  }
});

test("un parametre repete ne retient que le premier, et le valide quand meme", () => {
  assert.equal(triValide(["taux", "n'importe quoi"]), "taux");
  assert.equal(triValide(["n'importe quoi", "taux"]), TRI_PAR_DEFAUT);
});

test("chaque tri declare a un ordre ecrit dans la couche de donnees", async () => {
  /*
   * Une cle ajoutee ici sans fragment SQL correspondant produirait un ordre
   * « undefined » dans la requete : une erreur de base a l'execution, sur la
   * page publique. Le test l'attrape a l'ecriture.
   */
  const donnees = await readFile("lib/donnees.ts", "utf8");
  const bloc = donnees.slice(donnees.indexOf("const ORDRES"), donnees.indexOf("};", donnees.indexOf("const ORDRES")));

  for (const tri of TRIS) {
    assert.match(bloc, new RegExp(`\\b${tri}:`), `tri sans ordre SQL : ${tri}`);
  }
});

test("chaque tri a un libelle, et l'ordre courant s'affiche en toutes lettres", async () => {
  /* Un ordre appliqué mais non annoncé serait un classement caché — exactement
     ce que l'abandon de la page « pires courses » cherchait à éviter. */
  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));

  assert.deepEqual(Object.keys(libelles.courses.tris).sort(), [...TRIS].sort());

  for (const tri of TRIS) {
    assert.ok(libelles.courses.tris[tri].length > 0, `tri sans libelle : ${tri}`);
  }

  assert.ok(libelles.courses.ordre_courant.includes("{ordre}"));
});
