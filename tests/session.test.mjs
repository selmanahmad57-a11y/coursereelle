/**
 * Tests des sessions de connexion.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * La session porte la donnee que l'accord ignore : le temps connecte sans
 * course. Elle n'a pas de capture, et ne peut donc pas etre verifiee par
 * lecture d'image — exactement comme le temps reel d'une course. Sa defense est
 * ailleurs : filtre statistique et medianes.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  calculerSession,
  dureeConnecteeMinutes,
  horodatagesSession,
} from "../lib/calculs-session.ts";
import { controlerSession } from "../lib/validation/regles-session.ts";

const SEUILS = {
  dureeMinimaleMinutes: 15,
  dureeMaximaleMinutes: 16 * 60,
  cadenceMaximaleParHeure: 6,
};

const session = (surcharges) => ({
  connexionLe: "2026-09-03T11:00:00.000Z",
  deconnexionLe: "2026-09-03T15:00:00.000Z",
  nombreCourses: 7,
  revenuPlateformeEuros: 62.4,
  minutesEnCourse: 150,
  ...surcharges,
});

/* ------------------------------------------------------------------ */
/* Horodatages                                                         */
/* ------------------------------------------------------------------ */

test("une session ordinaire donne sa duree en minutes", () => {
  const horodatages = horodatagesSession("2026-09-03", "11:00", "15:00");

  assert.equal(dureeConnecteeMinutes(horodatages), 240);
});

test("une session qui traverse minuit n'oblige pas a saisir une seconde date", () => {
  /* Le livreur saisit l'heure qu'il a lue, pas une date : 20 h -> 1 h fait 5 h. */
  const horodatages = horodatagesSession("2026-09-03", "20:00", "01:00");

  assert.equal(dureeConnecteeMinutes(horodatages), 300);
  assert.equal(horodatages.deconnexionLe, "2026-09-04T01:00:00.000Z");
});

test("deux horaires identiques ne produisent pas une session de duree nulle", () => {
  const horodatages = horodatagesSession("2026-09-03", "11:00", "11:00");

  assert.equal(dureeConnecteeMinutes(horodatages), 24 * 60);
});

test("un formulaire incomplet ne produit aucun horodatage", () => {
  assert.equal(horodatagesSession("", "11:00", "15:00"), null);
  assert.equal(horodatagesSession("2026-09-03", "", "15:00"), null);
  assert.equal(horodatagesSession("2026-09-03", "11:00", ""), null);
});

/* ------------------------------------------------------------------ */
/* Le chiffre qui compte                                               */
/* ------------------------------------------------------------------ */

test("le taux est calcule sur le temps CONNECTE, attente comprise", () => {
  const resultat = calculerSession(session());

  assert.equal(resultat.dureeConnecteeMinutes, 240);
  assert.ok(Math.abs(resultat.tauxHoraireConnecte - 15.6) < 0.01);
});

test("la part payee montre ce que la garantie horaire ignore", () => {
  /* 150 minutes en course sur 240 connectees : 62,5 % du temps est paye. */
  const resultat = calculerSession(session());

  assert.ok(Math.abs(resultat.partPayee - 62.5) < 0.01);
});

test("sans temps en course declare, la part payee n'est pas inventee", () => {
  const resultat = calculerSession(session({ minutesEnCourse: null }));

  assert.equal(resultat.partPayee, null);
  assert.ok(resultat.tauxHoraireConnecte > 0, "le reste du calcul reste disponible");
});

test("la cadence se deduit du nombre de courses et de la duree", () => {
  const resultat = calculerSession(session());

  assert.equal(resultat.coursesParHeure, 1.75);
});

test("sans horaires, rien n'est calcule plutot qu'affiche a zero", () => {
  const resultat = calculerSession(session({ connexionLe: null, deconnexionLe: null }));

  assert.deepEqual(
    [
      resultat.dureeConnecteeMinutes,
      resultat.tauxHoraireConnecte,
      resultat.partPayee,
      resultat.coursesParHeure,
    ],
    [null, null, null, null]
  );
});

/* ------------------------------------------------------------------ */
/* Filtre 1 applique aux sessions                                      */
/* ------------------------------------------------------------------ */

test("une session ordinaire passe le filtre physique", () => {
  assert.deepEqual(controlerSession(session(), SEUILS), []);
});

test("une session de cinq minutes est refusee", () => {
  const anomalies = controlerSession(
    session({ deconnexionLe: "2026-09-03T11:05:00.000Z", nombreCourses: 0, minutesEnCourse: null }),
    SEUILS
  );

  assert.equal(anomalies[0].code, "duree_sous_minimum");
  assert.equal(anomalies[0].limite, 15);
});

test("dix-sept heures d'affilee sont refusees : personne ne livre autant", () => {
  const anomalies = controlerSession(
    session({
      deconnexionLe: "2026-09-04T04:00:00.000Z",
      nombreCourses: 10,
      minutesEnCourse: null,
    }),
    SEUILS
  );

  assert.equal(anomalies[0].code, "duree_sur_maximum");
});

test("une cadence de plus de six courses par heure est physiquement suspecte", () => {
  const anomalies = controlerSession(
    session({ nombreCourses: 30, minutesEnCourse: null }),
    SEUILS
  );

  assert.equal(anomalies[0].code, "cadence_impossible");
  assert.equal(anomalies[0].valeur, 7.5);
});

test("un temps en course superieur au temps connecte est impossible", () => {
  const anomalies = controlerSession(session({ minutesEnCourse: 300 }), SEUILS);

  assert.equal(anomalies[0].code, "temps_paye_superieur_au_connecte");
  assert.equal(anomalies[0].limite, 240, "la limite est la duree connectee elle-meme");
});

test("une limite absente de la configuration ne bloque rien", () => {
  const anomalies = controlerSession(session({ nombreCourses: 100 }), {
    dureeMinimaleMinutes: null,
    dureeMaximaleMinutes: null,
    cadenceMaximaleParHeure: null,
  });

  assert.deepEqual(anomalies, []);
});

/* ------------------------------------------------------------------ */
/* Le principe fondamental, cote session                               */
/* ------------------------------------------------------------------ */

test("une session miserablement payee traverse le filtre physique intacte", () => {
  const misere = session({ revenuPlateformeEuros: 4, nombreCourses: 2, minutesEnCourse: 40 });

  assert.deepEqual(
    controlerSession(misere, SEUILS),
    [],
    "seule la physique rejette : un revenu, aussi bas soit-il, est une preuve a publier"
  );

  assert.equal(calculerSession(misere).tauxHoraireConnecte, 1);
});
