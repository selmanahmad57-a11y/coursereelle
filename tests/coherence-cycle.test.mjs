/**
 * Cohérence des affirmations sur le cycle de vie des captures.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * L'accueil a affirmé « la capture, elle, a été supprimée » pendant que le
 * compteur de la page Méthode disait « 2 en cours de délai, 0 supprimées ». Les
 * deux venaient du même site, à la même seconde. La phrase était une inférence
 * publiée : le cycle est écrit, la suppression était due le soir même, elle
 * n'avait pas eu lieu.
 *
 * C'est la faute que ce projet traque depuis le début — une inférence déguisée
 * en constat — et c'était le dernier endroit du site où une phrase pouvait
 * devancer un fait. Ces tests interdisent qu'elle revienne.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ETATS_CAPTURE } from "../lib/cycle-capture.ts";
import { JETONS_TEXTE } from "../lib/cles.ts";
import { jetonsDe } from "../lib/textes.ts";

const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));
const cycle = libelles.accueil.vitrine.cycle;

/** Ce qu'une phrase ne peut affirmer que si la base le confirme. */
const AFFIRMATIONS_DE_SUPPRESSION = ["a été supprimée", "ont été supprimées"];

test("chaque état du cycle a sa phrase, et aucune n'est laissée au hasard", () => {
  /*
   * `etatCapture` peut rendre null — une course sans capture ni suppression, qui
   * ne se classe nulle part. Ce cas n'a pas de phrase, et c'est voulu : la page
   * n'affiche alors rien plutôt qu'une formule passe-partout.
   */
  for (const etat of ETATS_CAPTURE) {
    assert.equal(typeof cycle[etat], "string", `état sans phrase : ${etat}`);
    assert.ok(cycle[etat].length > 0, `phrase vide pour ${etat}`);
  }

  assert.deepEqual(
    Object.keys(cycle).sort(),
    [...ETATS_CAPTURE].sort(),
    "le tableau des phrases et la liste des états doivent coïncider exactement"
  );
});

test("seul l'état « supprimées » affirme une suppression accomplie", () => {
  /*
   * LE CŒUR DU TEST. Une phrase qui annonce la suppression alors que la course
   * est encore dans son délai est exactement la contradiction constatée : elle
   * dit vrai du mécanisme et faux de l'événement.
   */
  for (const [etat, phrase] of Object.entries(cycle)) {
    const affirme = AFFIRMATIONS_DE_SUPPRESSION.some((formule) => phrase.includes(formule));

    assert.equal(
      affirme,
      etat === "supprimees",
      `« ${etat} » ${affirme ? "affirme" : "n'affirme pas"} une suppression accomplie`
    );
  }
});

test("aucune autre phrase de l'accueil n'affirme l'état de la preuve", () => {
  /* La phrase fautive vivait dans `preuve`, hors du tableau des états : elle
     s'affichait donc quel que soit l'état réel de la capture. */
  const ailleurs = JSON.stringify({ ...libelles.accueil.vitrine, cycle: null });

  for (const formule of AFFIRMATIONS_DE_SUPPRESSION) {
    assert.equal(
      ailleurs.includes(formule),
      false,
      `« ${formule} » figure dans un texte que l'état ne conditionne pas`
    );
  }
});

test("l'accueil choisit sa phrase par la fonction qui alimente les compteurs", async () => {
  /*
   * Même source, comme pour le compteur de courses. Deux façons de déterminer un
   * même état finiraient par diverger, et la divergence serait publique.
   */
  const page = await readFile("app/page.tsx", "utf8");

  assert.match(page, /etatCapture\(/, "l'accueil doit lire l'état, pas le déduire");
  assert.match(page, /from "@\/lib\/cycle-capture\.ts"/);
});

test("aucun délai n'est épelé en toutes lettres à côté de son barème", () => {
  /*
   * Variante de la même faute : « quarante-huit heures » écrit dans la page
   * Méthode redevient faux le jour où le barème change, sans qu'aucun test ne
   * s'en aperçoive. Le jeton, lui, suit.
   */
  const regle = libelles.methode.captures.regle;

  assert.ok(regle.includes("{delai_suppression}"), "la règle doit porter le jeton");
  assert.equal(
    /quarante-huit|vingt-quatre|quarante huit/i.test(regle),
    false,
    "un délai épelé double le barème et finira par le contredire"
  );

  for (const jeton of jetonsDe(regle)) {
    assert.ok(Object.hasOwn(JETONS_TEXTE, jeton), `jeton inconnu : ${jeton}`);
  }
});
