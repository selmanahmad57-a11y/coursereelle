/**
 * Tests du cycle de vie des captures.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Une capture contient l'adresse du restaurant, celle de la livraison et
 * l'horaire. Le site promet que la ville est la granularite maximale de ce qu'il
 * conserve : une capture gardee indefiniment dement cette promesse. Ces tests
 * gardent la promesse tenue.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { capturesEchues, etatCapture, repartitionCaptures } from "../lib/cycle-capture.ts";

const MAINTENANT = "2026-09-05T12:00:00.000Z";
const DELAI = 48;

const capture = (surcharges) => ({
  id: "c1",
  cleR2: "captures/2026-09-03/abc.png",
  verdictLe: null,
  supprimeeLe: null,
  ...surcharges,
});

test("sans verdict, la capture sert encore et reste conservee", () => {
  /* C'est l'etat actuel des courses en attente de lecture : voulu, transitoire. */
  assert.equal(etatCapture(capture({}), MAINTENANT, DELAI), "en_attente_verdict");
});

test("le delai court a partir du verdict, pas de la soumission", () => {
  const recente = capture({ verdictLe: "2026-09-05T00:00:00.000Z" });
  const ancienne = capture({ verdictLe: "2026-09-03T00:00:00.000Z" });

  assert.equal(etatCapture(recente, MAINTENANT, DELAI), "dans_le_delai");
  assert.equal(etatCapture(ancienne, MAINTENANT, DELAI), "echues");
});

test("la limite est franche a l'heure pres", () => {
  const juste = capture({ verdictLe: "2026-09-03T12:00:00.000Z" });
  const presque = capture({ verdictLe: "2026-09-03T12:00:01.000Z" });

  assert.equal(etatCapture(juste, MAINTENANT, DELAI), "echues");
  assert.equal(etatCapture(presque, MAINTENANT, DELAI), "dans_le_delai");
});

test("une capture deja supprimee reste comptee comme supprimee", () => {
  const partie = capture({ cleR2: null, supprimeeLe: "2026-09-04T00:00:00.000Z" });

  assert.equal(etatCapture(partie, MAINTENANT, DELAI), "supprimees");
});

test("sans delai configure, la capture est traitee comme echue", () => {
  /* On ne pretend pas qu'une capture est dans les temps quand on ignore le
     delai : le doute joue en faveur de la suppression, pas de la conservation. */
  const jugee = capture({ verdictLe: "2026-09-05T11:59:00.000Z" });

  assert.equal(etatCapture(jugee, MAINTENANT, null), "echues");
});

test("une ligne sans capture ni suppression ne se classe nulle part", () => {
  assert.equal(etatCapture(capture({ cleR2: null }), MAINTENANT, DELAI), null);
});

test("les echues sont exactement celles que l'entretien doit supprimer", () => {
  const lot = [
    capture({ id: "a", verdictLe: "2026-09-01T00:00:00.000Z" }),
    capture({ id: "b", verdictLe: "2026-09-05T09:00:00.000Z" }),
    capture({ id: "c" }),
    capture({ id: "d", cleR2: null, supprimeeLe: "2026-09-02T00:00:00.000Z" }),
  ];

  assert.deepEqual(
    capturesEchues(lot, MAINTENANT, DELAI).map((c) => c.id),
    ["a"]
  );

  assert.deepEqual(repartitionCaptures(lot, MAINTENANT, DELAI), {
    en_attente_verdict: 1,
    dans_le_delai: 1,
    echues: 1,
    supprimees: 1,
  });
});

test("apres suppression, plus rien n'est echu", () => {
  const apres = [capture({ id: "a", cleR2: null, supprimeeLe: MAINTENANT })];

  assert.deepEqual(capturesEchues(apres, MAINTENANT, DELAI), []);
});
