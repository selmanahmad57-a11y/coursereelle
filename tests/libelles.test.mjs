/**
 * Tests des libelles d'affichage - Course Reelle
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * `config/libelles.json` traduit pour l'affichage les valeurs enumerees par
 * `config/baremes.schema.json`. Les deux fichiers doivent rester exactement
 * alignes : une plateforme ajoutee au schema sans libelle s'afficherait sous son
 * identifiant technique sur la page Methode, et un libelle orphelin signale un
 * oubli de nettoyage. Ce test rend les deux impossibles.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { lireJson } from "../scripts/valider-baremes.mjs";

const cheminSchema =
  process.env.BAREMES_SCHEMA ?? new URL("../config/baremes.schema.json", import.meta.url);
const cheminLibelles =
  process.env.LIBELLES_FICHIER ?? new URL("../config/libelles.json", import.meta.url);

const schema = await lireJson(cheminSchema);
const libelles = await lireJson(cheminLibelles);

const trier = (valeurs) => [...valeurs].sort();

/** Chaque enumeration du schema, en face de la table de libelles qui la traduit. */
const correspondances = [
  ["plateforme", "plateformes"],
  ["vehicule", "vehicules"],
  ["zone", "zones"],
  ["unite", "unites"],
];

for (const [defSchema, tableLibelles] of correspondances) {
  test(`chaque valeur de "${defSchema}" a exactement un libelle`, () => {
    assert.deepEqual(
      trier(Object.keys(libelles[tableLibelles])),
      trier(schema.$defs[defSchema].enum),
      `config/libelles.json > ${tableLibelles} doit couvrir $defs.${defSchema}.enum, sans manque ni surplus`
    );
  });
}

test("chaque usage possible a exactement un libelle", () => {
  const usages = new Set();

  for (const definition of Object.values(schema.$defs)) {
    const usage = definition?.properties?.usage;
    if (!usage) continue;
    if (usage.const !== undefined) usages.add(usage.const);
    for (const valeur of usage.enum ?? []) usages.add(valeur);
  }

  assert.ok(usages.size > 0, "le schema doit declarer au moins un usage");
  assert.deepEqual(trier(Object.keys(libelles.usages)), trier([...usages]));
});

test("chaque famille du schema a un titre et une description", () => {
  const famillesSchema = Object.entries(schema.properties)
    .filter(([, s]) => s.type === "array")
    .map(([nom]) => nom);

  assert.deepEqual(trier(Object.keys(libelles.familles)), trier(famillesSchema));

  for (const [nom, texte] of Object.entries(libelles.familles)) {
    assert.equal(typeof texte.titre, "string", `${nom} : titre manquant`);
    assert.ok(texte.titre.length > 0, `${nom} : titre vide`);
    assert.equal(typeof texte.description, "string", `${nom} : description manquante`);
    assert.ok(texte.description.length > 0, `${nom} : description vide`);
  }
});

test("chaque unite declare un symbole et un nombre de decimales", () => {
  for (const [unite, definition] of Object.entries(libelles.unites)) {
    assert.equal(typeof definition.symbole, "string", `${unite} : symbole manquant`);
    assert.ok(definition.symbole.length > 0, `${unite} : symbole vide`);
    for (const champ of ["decimales_min", "decimales_max"]) {
      assert.equal(typeof definition[champ], "number", `${unite} : ${champ} manquant`);
      assert.ok(definition[champ] >= 0, `${unite} : ${champ} negatif`);
    }
    assert.ok(
      definition.decimales_min <= definition.decimales_max,
      `${unite} : decimales_min doit rester sous decimales_max`
    );
  }
});

test("les trois etats de sourcage sont declares", () => {
  assert.deepEqual(trier(Object.keys(libelles.etats_source)), trier(["absente", "citee", "verifiee"]));
});

test("la locale est declaree et utilisable", () => {
  assert.equal(typeof libelles.locale, "string");
  assert.doesNotThrow(() => new Intl.NumberFormat(libelles.locale));
});

/* ------------------------------------------------------------------ */
/* Couverture des valeurs reellement utilisees                         */
/* ------------------------------------------------------------------ */

test("toutes les unites employees par les baremes ont un libelle", async () => {
  const cheminBaremes =
    process.env.BAREMES_FICHIER ?? new URL("../config/baremes.json", import.meta.url);
  const baremes = await lireJson(cheminBaremes);

  const familles = Object.entries(schema.properties)
    .filter(([, s]) => s.type === "array")
    .map(([nom]) => nom);

  const employees = new Set(familles.flatMap((f) => (baremes[f] ?? []).map((e) => e.unite)));

  for (const unite of employees) {
    assert.ok(libelles.unites[unite], `unite employee sans libelle : ${unite}`);
  }
});
