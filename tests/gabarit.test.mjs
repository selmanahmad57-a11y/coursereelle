/**
 * Tests du modele d'ancrage relatif.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Les coordonnees ci-dessous sont MESUREES sur des specimens reels, par l'outil
 * de calibration. Trois captures du meme ecran, prises a trois hauteurs de
 * defilement differentes :
 *
 *   « Duree »  x = 0,1076  y = 0,6527   (Android 720x1611)
 *   « Duree »  x = 0,0984  y = 0,4678   (iOS 1179x2422, defilee plus bas)
 *   « Duree »  x = 0,0984  y = 0,6171   (iOS 1179x2160)
 *
 * La colonne varie de 0,009. La position verticale varie de 0,185 — vingt fois
 * plus. Un ancrage vertical absolu aurait rejete des captures parfaitement
 * authentiques, ce qui est le pire echec possible pour ce site.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { controlerGabarit } from "../lib/validation/gabarit.ts";

const TOLERANCES = { x: 0.05, ligne: 0.02 };
const MOTIFS = { distance_km: "\\d{1,3}[.,]?\\d{0,2}\\s*km\\b" };

/* Le gabarit, tel que la calibration l'a tire du specimen iOS defile. */
const GABARIT = {
  id: "uber-eats-details",
  plateforme: "uber_eats",
  description: "recapitulatif Details",
  champs: [
    { cle: "duree", libelles: ["Durée"], x: 0.0984 },
    { cle: "distance", libelles: ["Distance"], x: 0.5848 },
    { cle: "distance_km", libelles: [], motif: "distance_km", x: 0.3511 },
    { cle: "vos_revenus", libelles: ["Vos revenus"], x: 0.2091 },
    { cle: "prix_total_du_trajet", libelles: ["Prix total du trajet"], x: 0.4411 },
  ],
  relations: [
    { type: "meme_ligne", champ: "duree", autre: "distance" },
    { type: "au_dessus", champ: "duree", autre: "distance_km" },
    { type: "au_dessus", champ: "distance_km", autre: "vos_revenus" },
    { type: "au_dessus", champ: "vos_revenus", autre: "prix_total_du_trajet" },
  ],
};

const detection = (texte, x, y) => ({ texte, x, y });

/* Le specimen Android : meme ecran, defilement different. */
const ANDROID = [
  detection("Durée", 0.1076, 0.6527),
  detection("Distance", 0.5931, 0.6527),
  detection("11.18 km", 0.3701, 0.6844),
  detection("Vos revenus", 0.2285, 0.9187),
  detection("Prix total du trajet", 0.4361, 0.9795),
];

/* Le specimen iOS clair : encore un autre defilement. */
const IOS_CLAIR = [
  detection("Durée", 0.0984, 0.6171),
  detection("Distance", 0.5848, 0.6171),
  detection("6.65 km", 0.3533, 0.6525),
  detection("Vos revenus", 0.2091, 0.9139),
  detection("Prix total du trajet", 0.4411, 0.9829),
];

const controler = (textes, gabarit = GABARIT) =>
  controlerGabarit("uber_eats", textes, [gabarit], TOLERANCES, MOTIFS);

/* ------------------------------------------------------------------ */
/* Ce qui doit passer                                                  */
/* ------------------------------------------------------------------ */

test("un gabarit reconnait une capture defilee differemment", () => {
  /*
   * C'est le test qui justifie tout le modele : ce specimen a « Duree » a
   * y = 0,6527 la ou le gabarit l'a mesure a 0,4678. Un ancrage absolu, meme
   * avec une tolerance de cinq pour cent, l'aurait rejete.
   */
  const verdict = controler(ANDROID);

  assert.equal(verdict.conforme, true);
  assert.deepEqual(verdict.relationsRompues, []);
  assert.deepEqual(verdict.manquants, []);
});

test("il reconnait aussi la troisieme hauteur de defilement", () => {
  assert.equal(controler(IOS_CLAIR).conforme, true);
});

test("un ancrage vertical absolu, lui, aurait echoue", () => {
  /* On le demontre plutot que de l'affirmer : la difference verticale entre
     deux specimens authentiques depasse largement toute tolerance raisonnable. */
  const ecart = Math.abs(0.6527 - 0.4678);

  assert.ok(ecart > TOLERANCES.x, `ecart vertical de ${ecart.toFixed(3)}`);
  assert.ok(ecart > TOLERANCES.ligne * 5);
});

test("un champ hors-champ n'est pas une anomalie", () => {
  /* Une capture defilee vers le bas coupe l'en-tete : « Duree » et « Distance »
     peuvent manquer sans que la mise en page soit suspecte. */
  const basDeLEcran = IOS_CLAIR.filter((t) => !["Durée", "Distance"].includes(t.texte));
  const verdict = controler(basDeLEcran);

  assert.equal(verdict.conforme, true);
  assert.deepEqual(verdict.manquants.sort(), ["distance", "duree"]);
});

/* ------------------------------------------------------------------ */
/* Ce qui doit echouer                                                 */
/* ------------------------------------------------------------------ */

test("des colonnes permutees sont refusees", () => {
  /* La fabrication naive : les bons libelles, aux mauvaises colonnes. */
  const permute = [
    detection("Durée", 0.5848, 0.6171),
    detection("Distance", 0.0984, 0.6171),
    detection("6.65 km", 0.3533, 0.6525),
    detection("Vos revenus", 0.2091, 0.9139),
    detection("Prix total du trajet", 0.4411, 0.9829),
  ];

  const verdict = controler(permute);

  assert.equal(verdict.conforme, false);
  assert.deepEqual(verdict.colonnesDeplacees.sort(), ["distance", "duree"]);
  assert.deepEqual(
    verdict.manquants,
    [],
    "les deux libelles sont bien la : deplaces, pas absents"
  );
});

test("un libelle absent reste hors-champ, un libelle deplace ne l'est pas", () => {
  /* La distinction sans laquelle il suffirait de permuter deux colonnes pour que
     le controle prenne la fabrication pour un defilement. */
  const sansDuree = IOS_CLAIR.filter((t) => t.texte !== "Durée");
  const dureeAilleurs = [...sansDuree, detection("Durée", 0.8, 0.6171)];

  assert.deepEqual(controler(sansDuree).manquants, ["duree"]);
  assert.equal(controler(sansDuree).conforme, true);

  assert.deepEqual(controler(dureeAilleurs).colonnesDeplacees, ["duree"]);
  assert.equal(controler(dureeAilleurs).conforme, false);
});

test("un ordre vertical inverse est refuse", () => {
  /* Les bonnes colonnes, le mauvais empilement : « Vos revenus » au-dessus de
     « Duree », ce qu'aucun defilement ne peut produire. */
  const inverse = [
    detection("Durée", 0.0984, 0.9000),
    detection("Distance", 0.5848, 0.9000),
    detection("6.65 km", 0.3533, 0.9300),
    detection("Vos revenus", 0.2091, 0.3000),
    detection("Prix total du trajet", 0.4411, 0.4000),
  ];

  const verdict = controler(inverse);

  assert.equal(verdict.conforme, false);
  assert.ok(verdict.relationsRompues.length > 0);
  assert.ok(verdict.relationsRompues.some((r) => r.startsWith("au_dessus")));
});

test("deux champs qui devraient etre alignes et ne le sont pas", () => {
  const desaligne = [
    detection("Durée", 0.0984, 0.6171),
    detection("Distance", 0.5848, 0.7500),
    detection("6.65 km", 0.3533, 0.8000),
    detection("Vos revenus", 0.2091, 0.9139),
    detection("Prix total du trajet", 0.4411, 0.9829),
  ];

  const verdict = controler(desaligne);

  assert.equal(verdict.conforme, false);
  assert.ok(verdict.relationsRompues.includes("meme_ligne:duree/distance"));
});

test("aucun champ trouve n'est pas du hors-champ : c'est un autre ecran", () => {
  const verdict = controler([detection("Panier", 0.5, 0.5), detection("Commander", 0.5, 0.7)]);

  assert.equal(verdict.conforme, false);
  assert.equal(verdict.reconnu, null);
  assert.equal(verdict.manquants.length, GABARIT.champs.length);
});

/* ------------------------------------------------------------------ */
/* L'etat d'attente                                                    */
/* ------------------------------------------------------------------ */

test("sans gabarit enregistre, rien n'est rejete", () => {
  const verdict = controlerGabarit("uber_eats", ANDROID, [], TOLERANCES, MOTIFS);

  assert.equal(verdict.conforme, true);
  assert.equal(verdict.reconnu, null);
});

test("sans tolerances configurees non plus", () => {
  assert.equal(controlerGabarit("uber_eats", ANDROID, [GABARIT], null, MOTIFS).conforme, true);
});

test("un gabarit d'une autre plateforme ne s'applique pas", () => {
  assert.equal(
    controlerGabarit("deliveroo", ANDROID, [GABARIT], TOLERANCES, MOTIFS).conforme,
    true
  );
});
