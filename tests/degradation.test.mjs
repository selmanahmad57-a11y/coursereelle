/**
 * Tests de la degradation asymetrique.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * La regle, dans les deux sens : un champ compare a un bareme doit etre lu
 * franchement ou la course echoue ; un champ purement declaratif peut rester non
 * verifie. Valider une course « sous la grille kilometrique » avec une distance
 * non verifiee serait une accusation sans preuve ; bloquer une course dont seule
 * la duree est illisible ferait dependre le verdict d'un accident de nettete.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { STATUTS_LECTURE } from "../lib/traitement-lecture.ts";
import { lireCapture } from "../lib/lecture-capture.ts";
import { CHAMPS_VERIFIES, tolerancesEffectives, verifierCapture } from "../lib/validation/ocr.ts";

const REGLES_LECTURE = {
  motifs: {
    prixEuros: "\\d{1,4}[.,]\\d{2}\\s*€",
    distanceKm: "\\d{1,3}[.,]?\\d{0,2}\\s*km\\b",
    dureeEstimeeMinutes: "\\d{1,3}\\s*min(\\s*\\d{1,2}\\s*s)?\\b",
  },
  confianceMinimale: 70,
};

const PROBANTS = ["prixEuros", "distanceKm"];
const TOLERANCES = { prixEuros: 0, distanceKm: 0.1, dureeEstimeeMinutes: 1 };
const SAISIE = { prixEuros: 6.34, distanceKm: 11.18, dureeEstimeeMinutes: 16 + 34 / 60 };

const zone = (texte, confiance, mots) => ({ texte, confiance, mots });

/* Reproduit la logique de verdict, sans base ni moteur. */
const juger = (zones, saisie = SAISIE) => {
  const lecture = lireCapture(CHAMPS_VERIFIES, zones, REGLES_LECTURE);

  const statuts = Object.fromEntries(
    CHAMPS_VERIFIES.map((champ) => {
      const issue = lecture.champs[champ].issue;
      if (saisie[champ] === null) return [champ, "non_saisi"];
      if (issue === "absente") return [champ, "absent_de_la_capture"];
      if (issue === "lue") return [champ, "verifie"];
      return [champ, "non_verifie_lecture_hesitante"];
    })
  );

  for (const champ of PROBANTS) {
    if (statuts[champ] !== "verifie") return { statut: "rejetee_auto", statuts, motif: "echec_lecture" };
  }

  const effectives = CHAMPS_VERIFIES.reduce(
    (acc, champ) => ({ ...acc, [champ]: statuts[champ] === "verifie" ? acc[champ] : null }),
    tolerancesEffectives(TOLERANCES, saisie, ["dureeEstimeeMinutes"])
  );

  const verdict = verifierCapture(saisie, lecture.valeurs, effectives);
  return { statut: verdict.accepte ? "validee_auto" : "rejetee_auto", statuts, motif: verdict.motif };
};

const PRIX = zone("6,34 €", 91);
const DISTANCE = zone("11.18 km", 97);
const DUREE_SURE = zone("16 min 34 s", 95, [
  { debut: 0, fin: 2, confiance: 95 },
  { debut: 3, fin: 6, confiance: 95 },
  { debut: 7, fin: 9, confiance: 95 },
  { debut: 10, fin: 11, confiance: 95 },
]);
const DUREE_HESITANTE = zone("16 min 34 s", 64, [
  { debut: 0, fin: 2, confiance: 97 },
  { debut: 3, fin: 6, confiance: 95 },
  { debut: 7, fin: 9, confiance: 64 },
  { debut: 10, fin: 11, confiance: 64 },
]);

test("tout lu franchement : la course est validee, tous les champs verifies", () => {
  const { statut, statuts } = juger([PRIX, DISTANCE, DUREE_SURE]);

  assert.equal(statut, "validee_auto");
  assert.deepEqual(Object.values(statuts), ["verifie", "verifie", "verifie"]);
});

test("une duree hesitante ne bloque pas : elle se degrade", () => {
  /* Le cas reel de la seconde course de reference. */
  const { statut, statuts } = juger([PRIX, DISTANCE, DUREE_HESITANTE]);

  assert.equal(statut, "validee_auto");
  assert.equal(statuts.dureeEstimeeMinutes, "non_verifie_lecture_hesitante");
  assert.equal(statuts.prixEuros, "verifie");
});

test("une duree absente de la capture se degrade de la meme facon", () => {
  /* Meme situation epistemique : nous ne savons pas. */
  const { statut, statuts } = juger([PRIX, DISTANCE]);

  assert.equal(statut, "validee_auto");
  assert.equal(statuts.dureeEstimeeMinutes, "absent_de_la_capture");
});

test("un prix hesitant bloque : c'est LA valeur probante", () => {
  const prixFlou = zone("6,34 €", 50, [{ debut: 0, fin: 6, confiance: 50 }]);
  const { statut, statuts, motif } = juger([prixFlou, DISTANCE, DUREE_SURE]);

  assert.equal(statut, "rejetee_auto");
  assert.equal(motif, "echec_lecture");
  assert.equal(statuts.prixEuros, "non_verifie_lecture_hesitante");
});

test("une distance hesitante bloque aussi : elle est comparee a la grille", () => {
  /* Valider « sous la grille kilometrique » sans distance verifiee serait une
     accusation sans preuve. */
  const distanceFloue = zone("11.18 km", 55, [{ debut: 0, fin: 8, confiance: 55 }]);
  const { statut } = juger([PRIX, distanceFloue, DUREE_SURE]);

  assert.equal(statut, "rejetee_auto");
});

test("un prix absent de la capture bloque : il n'y a rien a confirmer", () => {
  const { statut } = juger([DISTANCE, DUREE_SURE]);

  assert.equal(statut, "rejetee_auto");
});

test("la degradation ne desarme pas la divergence sur un champ lu franchement", () => {
  /* Une duree hesitante n'excuse pas un prix qui ne correspond pas. */
  const { statut, motif } = juger([zone("9,99 €", 95), DISTANCE, DUREE_HESITANTE]);

  assert.equal(statut, "rejetee_auto");
  assert.match(motif, /valeur_divergente:prixEuros/);
});

test("une duree hesitante n'est jamais comparee, donc jamais reprochee", () => {
  /* Elle vaut 16,57 sur la capture et 40 dans la saisie : sans verification,
     aucune divergence ne peut etre prononcee. */
  const { statut, statuts } = juger([PRIX, DISTANCE, DUREE_HESITANTE], {
    ...SAISIE,
    dureeEstimeeMinutes: 40,
  });

  assert.equal(statut, "validee_auto");
  assert.equal(statuts.dureeEstimeeMinutes, "non_verifie_lecture_hesitante");
});

test("les quatre statuts sont declares une seule fois, dans le code", () => {
  assert.deepEqual([...STATUTS_LECTURE].sort(), [
    "absent_de_la_capture",
    "non_saisi",
    "non_verifie_lecture_hesitante",
    "verifie",
  ]);
});
