/**
 * Tests des calculs de remuneration et du filtre de coherence physique.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Les modules testes ici sont volontairement purs : aucun bareme n'y est ecrit
 * en dur, tout arrive en parametre. C'est ce qui les rend testables directement,
 * et c'est aussi ce qui garantit qu'aucune valeur ne peut s'y glisser en douce.
 *
 * La course de reference est celle du dossier fondateur : 12,2 km paye 8,08 €,
 * 16 minutes estimees par l'application, 32 minutes reellement vecues.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  apresCotisations,
  calculer,
  ecartRelatif,
  tauxHoraire,
  vitesseMoyenne,
} from "../lib/calculs.ts";
import { enVigueur, estEnVigueur, uniqueEnVigueur } from "../lib/periodes.ts";
import { controlerCoherencePhysique } from "../lib/validation/regles-physiques.ts";

const COURSE_DU_DOSSIER = {
  prixPaye: 8.08,
  pourboire: null,
  distanceKm: 12.2,
  dureeReelleMinutes: 32,
  dureeEstimeeMinutes: 16,
};

const proche = (obtenu, attendu, tolerance = 0.01) => {
  assert.ok(
    obtenu !== null && Math.abs(obtenu - attendu) <= tolerance,
    `attendu ${attendu} (+/- ${tolerance}), obtenu ${obtenu}`
  );
};

/* ------------------------------------------------------------------ */
/* Taux horaires                                                       */
/* ------------------------------------------------------------------ */

test("la course du dossier donne bien 15,15 €/h sur le temps reel", () => {
  proche(tauxHoraire(8.08, 32), 15.15);
});

test("la meme course parait a 30,30 €/h sur le temps estime par l'application", () => {
  proche(tauxHoraire(8.08, 16), 30.3);
});

test("une estimation deux fois trop courte gonfle le taux affiche de 100 %", () => {
  proche(ecartRelatif(tauxHoraire(8.08, 32), tauxHoraire(8.08, 16)), 100);
});

test("le pourboire entre dans la remuneration quand il est renseigne", () => {
  const avec = calculer({ ...COURSE_DU_DOSSIER, pourboire: 2 }, null);
  const sans = calculer(COURSE_DU_DOSSIER, null);

  proche(avec.tauxHoraireReel, tauxHoraire(10.08, 32));
  assert.ok(avec.tauxHoraireReel > sans.tauxHoraireReel);
});

test("les cotisations sont retirees en points de pourcentage, comme dans la config", () => {
  proche(apresCotisations(100, 21.2), 78.8);
  proche(calculer(COURSE_DU_DOSSIER, 21.2).tauxHoraireNetEstime, 15.15 * 0.788, 0.02);
});

test("la vitesse moyenne se deduit de la distance et du temps reel", () => {
  proche(vitesseMoyenne(12.2, 32), 22.875);
});

/* ------------------------------------------------------------------ */
/* Absence de calcul plutot que calcul faux                            */
/* ------------------------------------------------------------------ */

test("une duree nulle ou negative ne produit pas d'infini", () => {
  assert.equal(tauxHoraire(8.08, 0), null);
  assert.equal(tauxHoraire(8.08, -5), null);
  assert.equal(vitesseMoyenne(12.2, 0), null);
});

test("un formulaire vide ne calcule rien plutot que d'afficher zero", () => {
  const resultat = calculer(
    {
      prixPaye: null,
      pourboire: null,
      distanceKm: null,
      dureeReelleMinutes: null,
      dureeEstimeeMinutes: null,
    },
    21.2
  );

  assert.deepEqual(
    [
      resultat.tauxHoraireReel,
      resultat.tauxHoraireEstime,
      resultat.ecartRelatif,
      resultat.tauxHoraireNetEstime,
      resultat.vitesseMoyenne,
    ],
    [null, null, null, null, null]
  );
});

test("sans taux de cotisations connu, le net n'est pas invente", () => {
  assert.equal(calculer(COURSE_DU_DOSSIER, null).tauxHoraireNetEstime, null);
});

/* ------------------------------------------------------------------ */
/* Periodes                                                            */
/* ------------------------------------------------------------------ */

test("une periode ouverte des deux cotes couvre toutes les dates", () => {
  assert.equal(estEnVigueur({ valable_du: null, valable_au: null }, "2020-01-01"), true);
  assert.equal(estEnVigueur({ valable_du: null, valable_au: null }, "2030-01-01"), true);
});

test("les bornes sont inclusives", () => {
  const periode = { valable_du: "2026-09-01", valable_au: "2026-09-30" };

  assert.equal(estEnVigueur(periode, "2026-08-31"), false);
  assert.equal(estEnVigueur(periode, "2026-09-01"), true);
  assert.equal(estEnVigueur(periode, "2026-09-30"), true);
  assert.equal(estEnVigueur(periode, "2026-10-01"), false);
});

test("enVigueur ne retient que les entrees applicables a la date", () => {
  const entrees = [
    { cle: "ancienne", valable_du: "2024-01-01", valable_au: "2025-12-31" },
    { cle: "actuelle", valable_du: "2026-01-01", valable_au: null },
  ];

  assert.deepEqual(
    enVigueur(entrees, "2026-09-03").map((e) => e.cle),
    ["actuelle"]
  );
});

test("en cas d'ambiguite, aucune valeur n'est choisie au hasard", () => {
  const ambigues = [
    { valable_du: null, valable_au: null },
    { valable_du: "2026-01-01", valable_au: null },
  ];

  assert.equal(uniqueEnVigueur(ambigues, "2026-09-03"), null);
  assert.equal(uniqueEnVigueur([], "2026-09-03"), null);
});

/* ------------------------------------------------------------------ */
/* Filtre 1 : coherence physique                                       */
/* ------------------------------------------------------------------ */

const SEUILS = {
  distanceMinimale: 0.3,
  distanceMaximale: 40,
  vitesseMinimale: 2,
  vitesseMaximale: 25,
};

test("la course du dossier a velo est physiquement possible", () => {
  assert.deepEqual(controlerCoherencePhysique(COURSE_DU_DOSSIER, SEUILS), []);
});

test("une vitesse impossible pour le vehicule declare est signalee", () => {
  const anomalies = controlerCoherencePhysique(
    { distanceKm: 30, dureeReelleMinutes: 20 },
    SEUILS
  );

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].code, "vitesse_sur_maximum");
  assert.equal(anomalies[0].limite, 25);
});

test("les bornes de distance sont controlees des deux cotes", () => {
  const trop_courte = controlerCoherencePhysique(
    { distanceKm: 0.1, dureeReelleMinutes: 10 },
    SEUILS
  );
  const trop_longue = controlerCoherencePhysique(
    { distanceKm: 60, dureeReelleMinutes: 200 },
    SEUILS
  );

  assert.equal(trop_courte[0].code, "distance_sous_minimum");
  assert.equal(trop_longue[0].code, "distance_sur_maximum");
});

test("un vehicule inconnu ne fait pas rejeter sur la vitesse", () => {
  const anomalies = controlerCoherencePhysique(
    { distanceKm: 30, dureeReelleMinutes: 20 },
    { ...SEUILS, vitesseMaximale: null }
  );

  assert.deepEqual(anomalies, []);
});

test("un formulaire incomplet ne declenche aucune anomalie", () => {
  assert.deepEqual(
    controlerCoherencePhysique({ distanceKm: null, dureeReelleMinutes: null }, SEUILS),
    []
  );
});

/* ------------------------------------------------------------------ */
/* Le principe fondamental, cote code                                  */
/* ------------------------------------------------------------------ */

test("une course scandaleusement mal payee traverse le filtre physique intacte", () => {
  const misere = {
    prixPaye: 0.5,
    pourboire: null,
    distanceKm: 12.2,
    dureeReelleMinutes: 32,
    dureeEstimeeMinutes: 16,
  };

  assert.deepEqual(
    controlerCoherencePhysique(misere, SEUILS),
    [],
    "seule la physique rejette : un montant, aussi bas soit-il, est une preuve a publier"
  );
});
