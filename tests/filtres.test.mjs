/**
 * Tests des filtres 2 (OCR) et 3 (anti-fraude).
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Le point critique de l'anti-fraude : l'empreinte d'un appareil change à
 * minuit, puisque le sel change. Une pause declenchee a 23 h 50 doit tenir a
 * 00 h 10 malgre ce changement. Les tests ci-dessous verifient l'invariant ET
 * demontrent la regression qu'il previent, en rejouant le meme scenario avec le
 * seul sel du jour.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  apresEchecOcr,
  apresSuccesOcr,
  calculerEmpreinte,
  empreinteCourante,
  empreintesCandidates,
  evaluerSoumission,
} from "../lib/validation/anti-fraude.ts";
import {
  controlerCapture,
  formatRefuseReconnu,
} from "../lib/validation/capture.ts";
import {
  CHAMPS_VERIFIES,
  comparerCapture,
  resumerMotif,
  verifierCapture,
} from "../lib/validation/ocr.ts";

/* ------------------------------------------------------------------ */
/* Anti-fraude : empreintes                                            */
/* ------------------------------------------------------------------ */

const ADRESSE = "203.0.113.7";

const SELS = [
  { jour: "2026-09-02", sel: "sel-de-la-veille" },
  { jour: "2026-09-03", sel: "sel-du-jour" },
];

const LIMITES = {
  soumissionsMaxParHeure: 10,
  soumissionsMaxParJour: 30,
  echecsOcrAvantPause: 3,
  dureePauseHeures: 24,
};

test("une empreinte est deterministe et ne ressemble pas a une adresse", async () => {
  const a = await calculerEmpreinte("sel-du-jour", ADRESSE);
  const b = await calculerEmpreinte("sel-du-jour", ADRESSE);

  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("203"), "l'adresse ne doit apparaitre nulle part");
});

test("changer de sel change l'empreinte du meme appareil", async () => {
  const hier = await calculerEmpreinte("sel-de-la-veille", ADRESSE);
  const aujourdhui = await calculerEmpreinte("sel-du-jour", ADRESSE);

  assert.notEqual(hier, aujourdhui, "c'est ce qui interdit tout suivi dans la duree");
});

test("les empreintes candidates couvrent tous les sels retenus, la plus recente d'abord", async () => {
  const candidates = await empreintesCandidates(ADRESSE, SELS);

  assert.equal(candidates.length, 2);
  assert.equal(empreinteCourante(candidates), await calculerEmpreinte("sel-du-jour", ADRESSE));
});

/* ------------------------------------------------------------------ */
/* Anti-fraude : le passage de minuit                                  */
/* ------------------------------------------------------------------ */

test("une pause declenchee a 23 h 50 tient toujours a 00 h 10, malgre le changement de sel", async () => {
  const empreinteDeLaVeille = await calculerEmpreinte("sel-de-la-veille", ADRESSE);

  /* Trois echecs OCR le 2 septembre a 23 h 50, sous l'empreinte de ce jour-la. */
  let suite = { echecsOcrConsecutifs: 0, pauseJusqua: null };
  for (let i = 0; i < 3; i += 1) {
    suite = apresEchecOcr(suite, "2026-09-02T23:50:00.000Z", LIMITES);
  }

  assert.equal(suite.echecsOcrConsecutifs, 3);
  assert.equal(suite.pauseJusqua, "2026-09-03T23:50:00.000Z");

  const etats = [{ empreinte: empreinteDeLaVeille, ...suite }];
  const maintenant = "2026-09-03T00:10:00.000Z";

  const avecTousLesSels = evaluerSoumission({
    empreintes: await empreintesCandidates(ADRESSE, SELS),
    seaux: [],
    etats,
    maintenant,
    limites: LIMITES,
  });

  assert.deepEqual(avecTousLesSels, {
    autorise: false,
    motif: "pause_apres_echecs_ocr",
  });

  /* La regression que cet invariant previent : avec le seul sel du jour,
     l'appareil serait libre dix minutes apres sa mise en pause. */
  const avecLeSeulSelDuJour = evaluerSoumission({
    empreintes: await empreintesCandidates(ADRESSE, [SELS[1]]),
    seaux: [],
    etats,
    maintenant,
    limites: LIMITES,
  });

  assert.equal(
    avecLeSeulSelDuJour.autorise,
    true,
    "demonstration : ne chercher que sous le sel du jour rendrait la pause inoperante"
  );
});

test("la limite horaire tient a cheval sur minuit", async () => {
  const empreinteDeLaVeille = await calculerEmpreinte("sel-de-la-veille", ADRESSE);

  /* Dix envois dans le seau de 23 h, donc sous l'empreinte de la veille. */
  const seaux = [
    { empreinte: empreinteDeLaVeille, heure: "2026-09-02T23:00:00.000Z", compteur: 10 },
  ];

  const decision = evaluerSoumission({
    empreintes: await empreintesCandidates(ADRESSE, SELS),
    seaux,
    etats: [],
    maintenant: "2026-09-03T00:10:00.000Z",
    limites: LIMITES,
  });

  assert.deepEqual(decision, { autorise: false, motif: "limite_horaire" });
});

test("la limite journaliere tient a cheval sur minuit", async () => {
  const empreinteDeLaVeille = await calculerEmpreinte("sel-de-la-veille", ADRESSE);

  const seaux = Array.from({ length: 3 }, (_, index) => ({
    empreinte: empreinteDeLaVeille,
    heure: `2026-09-02T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
    compteur: 10,
  }));

  const decision = evaluerSoumission({
    empreintes: await empreintesCandidates(ADRESSE, SELS),
    seaux,
    etats: [],
    maintenant: "2026-09-03T00:10:00.000Z",
    limites: LIMITES,
  });

  assert.deepEqual(decision, { autorise: false, motif: "limite_journaliere" });
});

test("un envoi isole a 23 h 50 ne bloque pas a 00 h 10", async () => {
  const empreinteDeLaVeille = await calculerEmpreinte("sel-de-la-veille", ADRESSE);

  const decision = evaluerSoumission({
    empreintes: await empreintesCandidates(ADRESSE, SELS),
    seaux: [
      { empreinte: empreinteDeLaVeille, heure: "2026-09-02T23:00:00.000Z", compteur: 1 },
    ],
    etats: [],
    maintenant: "2026-09-03T00:10:00.000Z",
    limites: LIMITES,
  });

  assert.deepEqual(decision, { autorise: true, motif: null });
});

test("au-dela de la retention des sels, plus aucun suivi n'est possible", async () => {
  /* Une pause posee il y a trois jours, sous un sel qui a depuis ete supprime. */
  const empreinteOubliee = await calculerEmpreinte("sel-supprime-depuis", ADRESSE);

  const decision = evaluerSoumission({
    empreintes: await empreintesCandidates(ADRESSE, SELS),
    seaux: [],
    etats: [
      {
        empreinte: empreinteOubliee,
        echecsOcrConsecutifs: 3,
        pauseJusqua: "2099-01-01T00:00:00.000Z",
      },
    ],
    maintenant: "2026-09-03T00:10:00.000Z",
    limites: LIMITES,
  });

  assert.deepEqual(
    decision,
    { autorise: true, motif: null },
    "limite assumee du filtre, et garantie d'anonymat : le suivi ne peut exceder la retention des sels"
  );
});

/* ------------------------------------------------------------------ */
/* Anti-fraude : seuils et pauses                                      */
/* ------------------------------------------------------------------ */

test("la pause ne tombe qu'au seuil d'echecs, et une reussite remet tout a zero", () => {
  const debut = { echecsOcrConsecutifs: 0, pauseJusqua: null };

  const premier = apresEchecOcr(debut, "2026-09-03T10:00:00.000Z", LIMITES);
  const second = apresEchecOcr(premier, "2026-09-03T10:01:00.000Z", LIMITES);

  assert.equal(premier.pauseJusqua, null);
  assert.equal(second.pauseJusqua, null);

  const troisieme = apresEchecOcr(second, "2026-09-03T10:02:00.000Z", LIMITES);
  assert.equal(troisieme.pauseJusqua, "2026-09-04T10:02:00.000Z");

  assert.deepEqual(apresSuccesOcr(), { echecsOcrConsecutifs: 0, pauseJusqua: null });
});

test("une pause expiree ne bloque plus", async () => {
  const empreinte = await calculerEmpreinte("sel-du-jour", ADRESSE);

  const decision = evaluerSoumission({
    empreintes: [empreinte],
    seaux: [],
    etats: [
      {
        empreinte,
        echecsOcrConsecutifs: 3,
        pauseJusqua: "2026-09-03T00:00:00.000Z",
      },
    ],
    maintenant: "2026-09-03T00:10:00.000Z",
    limites: LIMITES,
  });

  assert.deepEqual(decision, { autorise: true, motif: null });
});

test("une limite absente de la configuration ne bloque rien", async () => {
  const empreinte = await calculerEmpreinte("sel-du-jour", ADRESSE);

  const decision = evaluerSoumission({
    empreintes: [empreinte],
    seaux: [{ empreinte, heure: "2026-09-03T00:00:00.000Z", compteur: 1000 }],
    etats: [],
    maintenant: "2026-09-03T00:10:00.000Z",
    limites: { ...LIMITES, soumissionsMaxParHeure: null, soumissionsMaxParJour: null },
  });

  assert.deepEqual(decision, { autorise: true, motif: null });
});

/* ------------------------------------------------------------------ */
/* Filtre 2 : OCR                                                      */
/* ------------------------------------------------------------------ */

const TOLERANCES = { prixEuros: 0.01, distanceKm: 0.1, dureeEstimeeMinutes: 1 };

const SAISIE = { prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: 16 };

test("une capture qui concorde avec la saisie est acceptee", () => {
  const verdict = verifierCapture(SAISIE, { ...SAISIE }, TOLERANCES);

  assert.equal(verdict.accepte, true);
  assert.deepEqual(verdict.divergences, []);
  assert.equal(verdict.motif, null);
});

test("un ecart dans la tolerance passe, un ecart au-dela est rejete", () => {
  const dansLaTolerance = verifierCapture(SAISIE, { ...SAISIE, distanceKm: 12.25 }, TOLERANCES);
  assert.equal(dansLaTolerance.accepte, true);

  const horsTolerance = verifierCapture(SAISIE, { ...SAISIE, prixEuros: 9.5 }, TOLERANCES);
  assert.equal(horsTolerance.accepte, false);
  assert.equal(horsTolerance.motif, "valeur_divergente:prixEuros");
  assert.equal(horsTolerance.divergences[0].lu, 9.5);
  assert.equal(horsTolerance.divergences[0].saisi, 8.08);
});

test("une capture illisible produit un motif distinct d'une valeur manquante", () => {
  const illisible = verifierCapture(SAISIE, null, TOLERANCES);
  assert.equal(illisible.divergences.length, CHAMPS_VERIFIES.length);
  assert.ok(illisible.divergences.every((d) => d.motif === "capture_illisible"));

  const champManquant = verifierCapture(SAISIE, { ...SAISIE, distanceKm: null }, TOLERANCES);
  assert.equal(champManquant.motif, "valeur_absente_de_la_capture:distanceKm");
});

test("un champ saisi mais absent de la saisie est signale a part", () => {
  const verdict = verifierCapture({ ...SAISIE, prixEuros: null }, { ...SAISIE }, TOLERANCES);

  assert.equal(verdict.motif, "valeur_non_saisie:prixEuros");
});

test("une tolerance nulle en configuration retire le champ de la verification", () => {
  const verdict = verifierCapture(
    SAISIE,
    { ...SAISIE, prixEuros: 99 },
    { ...TOLERANCES, prixEuros: null }
  );

  assert.equal(verdict.accepte, true, "null signifie non verifie, pas verifie sans limite");
});

test("une tolerance a zero impose une concordance exacte", () => {
  const verdict = verifierCapture(
    SAISIE,
    { ...SAISIE, prixEuros: 8.09 },
    { ...TOLERANCES, prixEuros: 0 }
  );

  assert.equal(verdict.accepte, false);
});

test("plusieurs divergences produisent un motif normalise et stable", () => {
  const divergences = comparerCapture(
    SAISIE,
    { prixEuros: 2, distanceKm: 40, dureeEstimeeMinutes: 16 },
    TOLERANCES
  );

  assert.equal(resumerMotif(divergences), "valeur_divergente:prixEuros,valeur_divergente:distanceKm");
});

/* ------------------------------------------------------------------ */
/* Le principe fondamental, cote OCR                                   */
/* ------------------------------------------------------------------ */

test("une course miserable dont la capture concorde est acceptee", () => {
  const misere = { prixEuros: 2.6, distanceKm: 12.2, dureeEstimeeMinutes: 16 };

  const verdict = verifierCapture(misere, { ...misere }, TOLERANCES);

  assert.equal(
    verdict.accepte,
    true,
    "l'OCR verifie que le livreur n'a pas invente ses chiffres, jamais que ces chiffres sont acceptables"
  );
});

/* ------------------------------------------------------------------ */
/* Controle du fichier de capture                                       */
/* ------------------------------------------------------------------ */

const FORMATS = [
  { type_mime: "image/png", extensions: [".png"] },
  { type_mime: "image/jpeg", extensions: [".jpg", ".jpeg"] },
  { type_mime: "image/webp", extensions: [".webp"] },
];

const CONTRAINTES = {
  formatsAcceptes: FORMATS,
  tailleMinimaleOctets: 10 * 1024,
  tailleMaximaleOctets: 10 * 1024 * 1024,
};

const fichier = (surcharges) => ({
  type: "image/png",
  nom: "capture.png",
  taille: 800 * 1024,
  ...surcharges,
});

test("une capture d'ecran ordinaire passe", () => {
  assert.equal(controlerCapture(fichier({}), CONTRAINTES), null);
});

test("un fichier trop lourd est refuse avec sa limite", () => {
  const refus = controlerCapture(fichier({ taille: 12 * 1024 * 1024 }), CONTRAINTES);

  assert.equal(refus.motif, "fichier_trop_volumineux");
  assert.equal(refus.limite, CONTRAINTES.tailleMaximaleOctets);
});

test("un fichier trop leger n'est pas une capture lisible", () => {
  const refus = controlerCapture(fichier({ taille: 3 * 1024 }), CONTRAINTES);

  assert.equal(refus.motif, "fichier_trop_leger");
});

test("une capture de 6 Mo, comme en produisent les ecrans haute densite, passe", () => {
  assert.equal(controlerCapture(fichier({ taille: 6 * 1024 * 1024 }), CONTRAINTES), null);
});

test("un HEIC est refuse, et reconnu comme un cas explicable", () => {
  const photo = fichier({ type: "image/heic", nom: "IMG_0421.HEIC", taille: 2 * 1024 * 1024 });

  assert.equal(controlerCapture(photo, CONTRAINTES).motif, "format_non_pris_en_charge");

  const reconnu = formatRefuseReconnu(photo, [
    { type_mime: "image/heic", extensions: [".heic", ".heif"] },
  ]);

  assert.ok(reconnu, "le HEIC doit etre identifie pour pouvoir expliquer le refus");
});

test("l'extension prend le relais quand le navigateur n'annonce aucun type", () => {
  assert.equal(controlerCapture(fichier({ type: "", nom: "Capture.PNG" }), CONTRAINTES), null);
  assert.equal(
    controlerCapture(fichier({ type: "", nom: "photo.heic" }), CONTRAINTES).motif,
    "format_non_pris_en_charge"
  );
});

test("l'absence de fichier a son propre motif", () => {
  assert.equal(controlerCapture(null, CONTRAINTES).motif, "aucun_fichier");
});

test("le controle de capture ne regarde jamais ce qui est ecrit dessus", () => {
  /* Le contenant, jamais le contenu : aucun montant ne peut motiver un refus ici. */
  assert.equal(controlerCapture(fichier({}), { ...CONTRAINTES }), null);
  assert.deepEqual(Object.keys(fichier({})).sort(), ["nom", "taille", "type"]);
});
