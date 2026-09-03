/**
 * Tests des deux pages qui publient : Statistiques et Surveillance.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Les fixtures utilisees ici sont explicitement factices et vivent dans
 * tests/fixtures. tests/frontieres.test.mjs garantit qu'aucun fichier de
 * production ne peut les importer.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { etatPublication } from "../lib/publication.ts";
import { accesAutorise, jetonAcces } from "../lib/surveillance.ts";
import {
  aucuneCourse,
  tauxHorairesInsuffisants,
  tauxHorairesSuffisants,
} from "./fixtures/statistiques.mjs";

const SEUILS = { ecartsTypes: 3, effectifMinimal: 100 };

/* ------------------------------------------------------------------ */
/* Ce que le site a le droit d'afficher                                */
/* ------------------------------------------------------------------ */

test("sans aucune course, le site le dit et ne montre aucun chiffre", () => {
  const etat = etatPublication(aucuneCourse, SEUILS);

  assert.equal(etat.mode, "aucune_donnee");
  assert.equal(etat.effectif, 0);
  assert.equal(etat.resume, null, "aucun resume ne doit exister avant la premiere course");
});

test("sous le seuil, seul le compteur est affiche", () => {
  const etat = etatPublication(tauxHorairesInsuffisants, SEUILS);

  assert.equal(etat.mode, "compteur");
  assert.equal(etat.effectif, 30);
  assert.equal(etat.restantAvantPublication, 70);
  assert.equal(
    etat.resume,
    null,
    "meme calculee, une mediane sur trente courses ne doit pas pouvoir etre affichee"
  );
});

test("au-dela du seuil, les statistiques deviennent publiables", () => {
  const etat = etatPublication(tauxHorairesSuffisants, SEUILS);

  assert.equal(etat.mode, "statistiques");
  assert.equal(etat.restantAvantPublication, 0);
  assert.ok(etat.resume.mediane > 0);
  assert.ok(etat.resume.premierQuartile < etat.resume.mediane);
});

test("sans seuil connu, rien n'est publie : l'absence de reglage ne vaut pas autorisation", () => {
  const etat = etatPublication(tauxHorairesSuffisants, {
    ecartsTypes: 3,
    effectifMinimal: null,
  });

  assert.equal(etat.mode, "compteur");
  assert.equal(etat.resume, null);
});

/* ------------------------------------------------------------------ */
/* Acces au tableau de surveillance                                    */
/* ------------------------------------------------------------------ */

test("un mot de passe non configure FERME l'acces au lieu de l'ouvrir", () => {
  /* Sans cette regle, un deploiement ou la variable manque exposerait le
     tableau a tout le monde — l'echec par defaut le plus courant. */
  assert.equal(accesAutorise("", undefined), false);
  assert.equal(accesAutorise("", ""), false);
  assert.equal(accesAutorise("nimporte quoi", undefined), false);
  assert.equal(accesAutorise(null, "un-vrai-mot-de-passe"), false);
});

test("le bon mot de passe ouvre, un autre non", () => {
  assert.equal(accesAutorise("ouvre-toi", "ouvre-toi"), true);
  assert.equal(accesAutorise("ouvre-toi!", "ouvre-toi"), false);
  assert.equal(accesAutorise("ferme-toi", "ouvre-toi"), false);
  assert.equal(accesAutorise("ouvre", "ouvre-toi"), false);
});

test("le jeton depose en cookie ne contient jamais le mot de passe", async () => {
  const motDePasse = "un-mot-de-passe-tres-secret";
  const jeton = await jetonAcces(motDePasse);

  assert.match(jeton, /^[0-9a-f]{64}$/);
  assert.ok(!jeton.includes("secret"));
  assert.equal(await jetonAcces(motDePasse), jeton, "et il doit etre reproductible");
  assert.notEqual(await jetonAcces(`${motDePasse} `), jeton);
});
