/**
 * Tests du suivi des envois.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Deux courses réelles ont été refusées des heures après leur envoi, et leur
 * auteur ne l'a jamais su : la lecture est différée, et le site n'a ni compte ni
 * adresse pour prévenir. Cette page comble ce trou — sans rien apprendre au
 * serveur, ce que ces tests vérifient plutôt que de le promettre.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ajouterEnvoi,
  decoderEnvois,
  estIdentifiant,
} from "../lib/envois.ts";

const UN = "8114ff86-0000-4000-8000-000000000001";
const DEUX = "f565b6ff-0000-4000-8000-000000000002";

test("seul un identifiant de la bonne forme est retenu", () => {
  /* Le contrôle a deux effets : rien d'abîmé n'atteint le serveur, et un
     identifiant pareil ne se devine pas — le connaître, c'est avoir soumis. */
  assert.equal(estIdentifiant(UN), true);

  for (const faux of [null, undefined, "", "1", "../autre", "8114ff86", 42, {}]) {
    assert.equal(estIdentifiant(faux), false, `« ${String(faux)} » ne devrait pas passer`);
  }
});

test("rien de ce qui vient du stockage ne casse la page", () => {
  for (const brut of [null, "", "pas du json", "{}", "42", '["x"]', '[{"id":"abc"}]']) {
    assert.deepEqual(decoderEnvois(brut, 10), []);
  }

  assert.deepEqual(decoderEnvois(`[{"id":"${UN}","envoyeLe":"2026-09-04"}]`, 10), [
    { id: UN, envoyeLe: "2026-09-04" },
  ]);
});

test("le plus récent d'abord, sans doublon, et borné", () => {
  const un = { id: UN, envoyeLe: "2026-09-04" };
  const deux = { id: DEUX, envoyeLe: "2026-09-05" };

  assert.deepEqual(ajouterEnvoi([un], deux, 10), [deux, un]);
  assert.deepEqual(ajouterEnvoi([un], un, 10), [un], "un envoi ne se compte pas deux fois");
  assert.equal(ajouterEnvoi([un], deux, 1).length, 1, "la liste reste bornée");
  assert.deepEqual(ajouterEnvoi([un], { id: "abîmé", envoyeLe: "" }, 10), [un]);
});

test("l'API n'accepte qu'un identifiant à la fois, par construction", async () => {
  /*
   * LE POINT QUI COMPTE POUR LA VIE PRIVÉE. Une route qui accepterait une liste
   * permettrait de recouper plusieurs courses en une requête, donc de dessiner
   * un profil. L'identifiant est dans le chemin : il n'y a aucune façon d'en
   * demander deux.
   */
  const route = await readFile("app/api/envois/[id]/route.ts", "utf8");

  assert.match(route, /params/, "l'identifiant vient du chemin");
  assert.match(route, /estIdentifiant\(id\)/, "la forme est vérifiée avant toute requête");
  assert.equal(/\bany\(/.test(route), false, "aucune requête par lot");
  assert.equal(/\bin \(/.test(route), false, "aucune requête par lot");
});

test("la page annonce la limite du suivi local", async () => {
  /* Perdre son navigateur fait perdre le suivi, jamais les courses. Le dire est
     la contrepartie de l'absence de compte. */
  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));

  assert.match(libelles.envois.limite, /appareil/);
  assert.match(libelles.envois.limite, /jamais les courses/);
  assert.match(libelles.formulaire.succes.explication, /Mes envois/);
});

test("le rejet différé enseigne comme le rejet immédiat", async () => {
  /* Le guide des captures s'ouvre pour les mêmes trois motifs, sur la page de
     suivi comme dans le formulaire : une seule liste, deux endroits. */
  const liste = await readFile("components/ListeEnvois.tsx", "utf8");

  assert.match(liste, /appelleLeGuide\(/);
  assert.match(liste, /<GuideCapture/);
});

test("la case de consultation est annoncée avant d'être trouvée", async () => {
  /*
   * LA RÈGLE DE LA MAISON. Une mesure découverte après coup ne vaut rien, quelle
   * que soit son innocuité. La route lève une case « verdict consulté » ; ce
   * test lie cette écriture à sa déclaration publique — retirer la section de la
   * page Méthode sans retirer la mesure fait échouer la suite.
   */
  const route = await readFile("app/api/envois/[id]/route.ts", "utf8");

  if (!/verdict_consulte/.test(route)) return;

  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));
  const section = libelles.methode.consultation;

  assert.ok(section, "la mesure existe : la page Méthode doit la déclarer");
  for (const part of ["titre", "texte", "raison", "portee", "consequence"]) {
    assert.equal(typeof section[part], "string");
    assert.notEqual(section[part].trim(), "");
  }

  assert.match(section.texte, /au moins une fois/);
  assert.match(section.texte, /jamais quand ni combien de fois/);

  const page = await readFile("app/methode/page.tsx", "utf8");
  assert.match(page, /libelles\.methode\.consultation\.texte/, "la section doit être rendue");
  assert.match(page, /libelles\.methode\.consultation\.raison/);
  assert.match(page, /libelles\.methode\.consultation\.portee/);
});

test("la mesure reste la plus pauvre qui réponde à la question", async () => {
  /*
   * Un compteur dirait l'assiduité, un horodatage dirait les habitudes : ni l'un
   * ni l'autre n'ajoute quoi que ce soit au ratio cherché. Ce test empêche la
   * dérive silencieuse d'un booléen vers une trace de fréquentation.
   */
  const schema = await readFile("sql/schema.sql", "utf8");
  const route = await readFile("app/api/envois/[id]/route.ts", "utf8");
  const liste = await readFile("components/ListeEnvois.tsx", "utf8");

  assert.match(schema, /verdict_consulte boolean/, "une case, pas un nombre ni une date");
  assert.equal(
    /consultations?_(nombre|compte|total)|derniere_consultation|consulte_le/.test(schema),
    false,
    "ni compteur ni horodatage de consultation"
  );

  assert.match(route, /set verdict_consulte = true/, "elle se lève, elle ne s'incrémente pas");
  assert.match(
    route,
    /where id = \$\{id\} and verdict_consulte = false/,
    "écrite une seule fois : la seconde visite ne touche rien"
  );

  assert.equal(
    /verdict_consulte/.test(liste),
    false,
    "levée par le serveur, jamais par le navigateur — sinon elle serait gonflable"
  );
});
