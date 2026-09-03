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

test("une duree dont seul le marqueur de secondes est flou est bien lue", () => {
  /*
   * Le « s » est a 64, mais « 16 » et « 34 » sont a 95 et 93. Le marqueur a
   * rempli son role — le motif a reconnu la forme — et il ne fausse aucune
   * valeur. Ce test decrivait l'inverse avant que la confiance ne porte sur les
   * seuls mots porteurs de chiffres.
   */
  const lecture = lireChamp("dureeEstimeeMinutes", RECAPITULATIF, REGLES);

  assert.equal(lecture.issue, "lue");
  assert.equal(lecture.confiance, 93, "la moins sure des deux paires de chiffres");
  assert.ok(Math.abs(lecture.valeur - (16 + 34 / 60)) < 0.001);
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
  /* Cette fois le chiffre des secondes lui-meme est incertain, a 64. */
  const secondesDouteuses = [
    zone("6,34€", 91),
    zone("16 min 34 s", 64, [
      { debut: 0, fin: 2, confiance: 97 },
      { debut: 3, fin: 6, confiance: 95 },
      { debut: 7, fin: 9, confiance: 64 },
      { debut: 10, fin: 11, confiance: 64 },
    ]),
  ];

  const lecture = lireCapture(CHAMPS_VERIFIES, secondesDouteuses, REGLES);

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

/* ------------------------------------------------------------------ */
/* La confiance porte sur les chiffres, pas sur les unites             */
/* ------------------------------------------------------------------ */

test("un marqueur d'unite mal lu ne fait plus baisser le score", () => {
  /*
   * Le role du « s » est structurel : il permet au motif de reconnaitre la forme
   * et d'interpreter « 16 min 34 s » comme 16,57. Ce travail est fait au moment
   * ou le motif correspond. Ce qui peut fausser la valeur, ce sont les chiffres.
   */
  const avecUniteFloue = zone("16 min 34 s", 40, [
    { debut: 0, fin: 2, confiance: 95 },
    { debut: 3, fin: 6, confiance: 40 },
    { debut: 7, fin: 9, confiance: 93 },
    { debut: 10, fin: 11, confiance: 40 },
  ]);

  const lecture = lireChamp("dureeEstimeeMinutes", [avecUniteFloue], REGLES);

  assert.equal(lecture.issue, "lue");
  assert.equal(lecture.confiance, 93, "seuls « 16 » et « 34 » comptent");
});

test("un chiffre mal lu, lui, fait hesiter — meme entoure de mots surs", () => {
  /* Le cas reel de la seconde course de reference : « 34 » a 64. */
  const avecChiffreFlou = zone("16 min 34 s", 64, [
    { debut: 0, fin: 2, confiance: 97 },
    { debut: 3, fin: 6, confiance: 95 },
    { debut: 7, fin: 9, confiance: 64 },
    { debut: 10, fin: 11, confiance: 64 },
  ]);

  const lecture = lireChamp("dureeEstimeeMinutes", [avecChiffreFlou], REGLES);

  assert.equal(lecture.issue, "peu_sure");
  assert.equal(lecture.confiance, 64, "un chiffre incertain change la valeur");
});

test("une forme tronquee par un chiffre voisin ne conclut rien", () => {
  /*
   * « 116 min » reconnu comme « 16 min » donnerait une valeur fausse avec une
   * confiance excellente : c'est le garde-fou de structure.
   */
  /* Le motif accepte au plus trois chiffres : sur « 1234 min » il ne peut lire
     que « 234 min », et le « 1 » colle a gauche revele la troncature. */
  const tronquee = zone("1234 min", 95, [
    { debut: 0, fin: 4, confiance: 95 },
    { debut: 5, fin: 8, confiance: 95 },
  ]);

  assert.equal(lireChamp("dureeEstimeeMinutes", [tronquee], REGLES).issue, "ambigue");
});

test("un chiffre separe par une espace ne tronque rien", () => {
  /* « 16 min 34 s 11.18 km » : la distance qui suit n'est pas une troncature. */
  const composee = zone("16 min 34 s 11.18 km", 90, [
    { debut: 0, fin: 2, confiance: 95 },
    { debut: 3, fin: 6, confiance: 95 },
    { debut: 7, fin: 9, confiance: 95 },
    { debut: 10, fin: 11, confiance: 90 },
    { debut: 12, fin: 17, confiance: 96 },
    { debut: 18, fin: 20, confiance: 94 },
  ]);

  assert.equal(lireChamp("dureeEstimeeMinutes", [composee], REGLES).issue, "lue");
  assert.equal(lireChamp("distanceKm", [composee], REGLES).valeur, 11.18);
});
