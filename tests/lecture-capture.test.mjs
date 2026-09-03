/**
 * Tests de l'extraction des valeurs d'une capture.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Le texte entre ici et n'en ressort jamais : ces tests verifient d'abord que
 * les valeurs sont bien tirees, ensuite qu'aucune chaine lue ne subsiste dans
 * ce qui est renvoye. Les cas sont ceux des captures reelles, y compris la
 * ligne qui melange duree et distance.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { lectureConcluante, lireCapture, lireChamp } from "../lib/lecture-capture.ts";
import { CHAMPS_VERIFIES } from "../lib/validation/ocr.ts";

const REGLES = {
  motifs: {
    prixEuros: "\\d{1,4}[.,]\\d{2}\\s*€",
    distanceKm: "\\d{1,3}[.,]?\\d{0,2}\\s*km\\b",
    dureeEstimeeMinutes: "\\d{1,3}\\s*min(\\s*\\d{1,2}\\s*s)?\\b",
  },
  confianceMinimale: 70,
};

const zone = (texte, confiance = 90, mots) => ({ texte, confiance, mots });

/* Telle qu'elle sort vraiment d'un recapitulatif. */
const RECAPITULATIF = [
  zone("€ Détails e", 80),
  zone("6,34€", 91),
  zone("Durée Distance", 88),
  zone("16 min 34 s 11.18 km", 64, [
    { debut: 0, fin: 2, confiance: 95 },
    { debut: 3, fin: 6, confiance: 92 },
    { debut: 7, fin: 9, confiance: 93 },
    { debut: 10, fin: 11, confiance: 64 },
    { debut: 12, fin: 17, confiance: 96 },
    { debut: 18, fin: 20, confiance: 94 },
  ]),
  zone("18 Rue des Carrières, 49070 Saint-Lambert", 85),
];

test("le prix est lu sur un montant isole", () => {
  const lecture = lireChamp("prixEuros", RECAPITULATIF, REGLES);

  assert.equal(lecture.issue, "lue");
  assert.equal(lecture.valeur, 6.34);
});

test("une valeur au milieu d'une ligne partagee garde SA confiance", () => {
  /*
   * Le defaut qui a fait rejeter les deux premieres courses : la distance
   * heritait de la confiance du mot le plus flou de sa ligne, ici le « s » des
   * secondes a 64. Sa propre confiance est de 94.
   */
  const lecture = lireChamp("distanceKm", RECAPITULATIF, REGLES);

  assert.equal(lecture.issue, "lue");
  assert.equal(lecture.valeur, 11.18);
  assert.ok(lecture.confiance >= 90, `confiance obtenue : ${lecture.confiance}`);
});

test("une duree dont le marqueur de secondes est flou reste hesitante", () => {
  /* Le « s » a 64 : sans lui, la valeur vaudrait 16 et non 16,57. On ne tranche pas. */
  const lecture = lireChamp("dureeEstimeeMinutes", RECAPITULATIF, REGLES);

  assert.equal(lecture.issue, "peu_sure");
  assert.equal(lecture.valeur, null, "une lecture hesitante ne livre aucune valeur");
});

test("deux valeurs differentes de meme forme rendent la lecture ambigue", () => {
  /* On ne choisit pas celle qui arrange : ce serait valider par hypothese. */
  const lecture = lireChamp("prixEuros", [zone("8,08 €"), zone("2,60 €")], REGLES);

  assert.equal(lecture.issue, "ambigue");
  assert.equal(lecture.valeur, null);
});

test("une meme valeur repetee n'est pas une ambiguite", () => {
  const lecture = lireChamp("prixEuros", [zone("6,34 €", 80), zone("6,34€", 91)], REGLES);

  assert.equal(lecture.issue, "lue");
  assert.equal(lecture.confiance, 91, "on retient la lecture la plus sure");
});

test("un champ absent de la capture est absent, pas rejete", () => {
  const lecture = lireChamp("dureeEstimeeMinutes", [zone("+ 8,08 €"), zone("+ 12.2 km")], REGLES);

  assert.equal(lecture.issue, "absente");
});

test("l'ecran d'acceptation livre le prix et la distance", () => {
  const acceptation = [zone("+ 8,08 €", 75), zone("® + 12.2 km", 88), zone("Accepter", 92)];
  const lecture = lireCapture(CHAMPS_VERIFIES, acceptation, REGLES);

  assert.equal(lecture.valeurs.prixEuros, 8.08);
  assert.equal(lecture.valeurs.distanceKm, 12.2);
  assert.equal(lecture.valeurs.dureeEstimeeMinutes, null, "cet ecran n'affiche pas la duree");
});

test("aucune chaine lue ne subsiste dans ce qui est renvoye", () => {
  const lecture = lireCapture(CHAMPS_VERIFIES, RECAPITULATIF, REGLES);

  const chaines = [];
  const parcourir = (valeur) => {
    if (typeof valeur === "string") chaines.push(valeur);
    else if (Array.isArray(valeur)) valeur.forEach(parcourir);
    else if (valeur && typeof valeur === "object") Object.values(valeur).forEach(parcourir);
  };
  parcourir(lecture);

  const autorisees = new Set(["lue", "absente", "ambigue", "peu_sure"]);

  for (const chaine of chaines) {
    assert.ok(autorisees.has(chaine), `chaine issue de l'image : « ${chaine} »`);
  }
});

test("une lecture hesitante sur un champ attendu interdit tout verdict", () => {
  const lecture = lireCapture(CHAMPS_VERIFIES, RECAPITULATIF, REGLES);

  assert.deepEqual(lectureConcluante(lecture, ["prixEuros"]), {
    concluante: true,
    motif: null,
  });

  assert.deepEqual(lectureConcluante(lecture, ["prixEuros", "dureeEstimeeMinutes"]), {
    concluante: false,
    motif: "echec_lecture",
  });
});

test("un champ que l'on n'attendait pas ne bloque rien", () => {
  const lecture = lireCapture(CHAMPS_VERIFIES, [zone("+ 8,08 €", 95)], REGLES);

  assert.equal(lectureConcluante(lecture, ["prixEuros"]).concluante, true);
});
