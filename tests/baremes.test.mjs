/**
 * Tests des baremes dates - Course Reelle
 *
 * Usage : node --test tests/
 *
 * Le point critique verifie ici : aucune periode ne peut se chevaucher pour une
 * meme cle a l'interieur d'une meme portee - plateforme, zone ou vehicule, selon
 * ce que la famille declare dans `x-portee`. Sans cette garantie, une course ne peut plus
 * etre jugee selon les regles en vigueur a sa date, et l'historique publie
 * devient incoherent.
 *
 * Les valeurs des fixtures sont synthetiques : elles ne representent aucun bareme
 * reel et ne doivent jamais servir de source.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { validerBaremes, lireJson } from "../scripts/valider-baremes.mjs";

/* Chemins surchargeables par l'environnement, sinon resolus depuis ce fichier. */
const cheminSchema = process.env.BAREMES_SCHEMA ?? new URL("../config/baremes.schema.json", import.meta.url);
const cheminBaremes = process.env.BAREMES_FICHIER ?? new URL("../config/baremes.json", import.meta.url);

const schema = await lireJson(cheminSchema);

/* ------------------------------------------------------------------ */
/* Fabriques de fixtures                                               */
/* ------------------------------------------------------------------ */

const regle = (surcharges) => ({
  cle: "regle_de_test",
  libelle: "Regle synthetique de test",
  plateformes: ["uber_eats"],
  valeur: 1,
  unite: "EUR_PAR_COURSE",
  usage: "comparaison",
  valable_du: "2024-01-01",
  valable_au: null,
  source: { libelle: "Fixture de test", url: null, consultee_le: null },
  ...surcharges,
});

const parametre = (surcharges) => ({
  cle: "parametre_de_test",
  libelle: "Parametre synthetique de test",
  valeur: 1,
  unite: "COURSES",
  usage: "statistique",
  valable_du: "2024-01-01",
  valable_au: null,
  justification: "Fixture de test",
  ...surcharges,
});

const legale = (surcharges) => ({
  cle: "regle_legale_de_test",
  libelle: "Regle legale synthetique de test",
  valeur: 1,
  unite: "POURCENT",
  usage: "calcul",
  definition: "Fixture de test",
  valable_du: "2024-01-01",
  valable_au: null,
  source: { libelle: "Fixture de test", url: null, consultee_le: null },
  ...surcharges,
});

const document = ({ regles = [], legales = [], parametres = [] }) => ({
  version_schema: 1,
  regles_annoncees: regles,
  regles_legales: legales,
  parametres_systeme: parametres,
});

/* ------------------------------------------------------------------ */
/* La configuration reelle                                             */
/* ------------------------------------------------------------------ */

test("la configuration du projet est valide", async () => {
  const baremes = await lireJson(cheminBaremes);
  const { erreurs, avertissements } = validerBaremes(baremes, schema);

  assert.deepEqual(erreurs, [], "les baremes du projet doivent etre sans erreur");
  assert.deepEqual(avertissements, [], "les baremes du projet doivent etre sans trou");
});

/* ------------------------------------------------------------------ */
/* Non-chevauchement des periodes                                      */
/* ------------------------------------------------------------------ */

test("deux periodes qui se chevauchent pour la meme cle et la meme plateforme sont refusees", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ valable_du: "2024-01-01", valable_au: "2024-06-30" }),
        regle({ valable_du: "2024-06-15", valable_au: "2024-12-31" }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /chevauchement/);
  assert.match(erreurs[0], /Fermer la premiere au 2024-06-14/);
});

test("une periode encore en vigueur bloque toute periode posterieure", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ valable_du: "2024-01-01", valable_au: null }),
        regle({ valable_du: "2025-01-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /chevauchement/);
});

test("deux periodes contigues sont acceptees sans avertissement", () => {
  const { erreurs, avertissements } = validerBaremes(
    document({
      regles: [
        regle({ valable_du: "2024-01-01", valable_au: "2024-08-31" }),
        regle({ valable_du: "2024-09-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
  assert.deepEqual(avertissements, []);
});

test("les memes dates sur des plateformes differentes ne se chevauchent pas", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ plateformes: ["uber_eats"], valable_du: "2024-01-01", valable_au: null }),
        regle({ plateformes: ["deliveroo"], valable_du: "2024-01-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
});

test("le chevauchement est detecte plateforme par plateforme dans une liste", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({
          plateformes: ["uber_eats", "deliveroo"],
          valable_du: "2024-01-01",
          valable_au: "2024-12-31",
        }),
        regle({ plateformes: ["uber_eats"], valable_du: "2024-06-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1, "seule la plateforme commune doit remonter");
  assert.match(erreurs[0], /plateformes=uber_eats/);
});

test("les parametres systeme sans discriminant partagent la portee globale", () => {
  const { erreurs } = validerBaremes(
    document({
      parametres: [
        parametre({ valable_du: "2024-01-01", valable_au: "2024-12-31" }),
        parametre({ valable_du: "2024-03-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /\[global\]/);
});

test("des cles differentes ne se chevauchent jamais entre elles", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ cle: "premiere_regle", valable_du: "2024-01-01", valable_au: null }),
        regle({ cle: "seconde_regle", valable_du: "2024-01-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
});

test("un trou entre deux periodes est un avertissement, pas une erreur", () => {
  const { erreurs, avertissements } = validerBaremes(
    document({
      regles: [
        regle({ valable_du: "2024-01-01", valable_au: "2024-06-30" }),
        regle({ valable_du: "2024-09-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
  assert.equal(avertissements.length, 1);
  assert.match(avertissements[0], /trou entre 2024-06-30 et 2024-09-01/);
});

test("une periode inversee est refusee", () => {
  const { erreurs } = validerBaremes(
    document({ regles: [regle({ valable_du: "2024-12-31", valable_au: "2024-01-01" })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /periode inversee/);
});

/* ------------------------------------------------------------------ */
/* Le principe fondamental, impose par le schema                       */
/* ------------------------------------------------------------------ */

test("une regle annoncee ne peut pas servir de critere de rejet", () => {
  const { erreurs } = validerBaremes(
    document({ regles: [regle({ usage: "rejet" })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /usage/);
  assert.match(erreurs[0], /comparaison/);
});

test("un parametre systeme peut, lui, servir de critere de rejet", () => {
  const { erreurs } = validerBaremes(
    document({ parametres: [parametre({ usage: "rejet", unite: "KM_PAR_HEURE", valeur: 1 })] }),
    schema
  );

  assert.deepEqual(erreurs, []);
});

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

test("un champ obligatoire manquant est signale", () => {
  const incomplete = regle({});
  delete incomplete.source;

  const { erreurs } = validerBaremes(document({ regles: [incomplete] }), schema);

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /"source" absent/);
});

test("un champ inconnu est refuse", () => {
  const { erreurs } = validerBaremes(
    document({ regles: [regle({ valeur_approximative: 3 })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /champ inconnu/);
});

test("une plateforme hors liste est refusee", () => {
  const { erreurs } = validerBaremes(
    document({ regles: [regle({ plateformes: ["plateforme_inconnue"] })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /hors liste autorisee/);
});

test("une date mal formee est refusee", () => {
  const { erreurs } = validerBaremes(
    document({ regles: [regle({ valable_du: "01/09/2026" })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /format attendu/);
});

test("une source sans url reste acceptee, avec consultee_le a null", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [regle({ source: { libelle: "Annonce a sourcer", url: null, consultee_le: null } })],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
});

/* ------------------------------------------------------------------ */
/* Portees declarees dans le schema (x-portee)                         */
/* ------------------------------------------------------------------ */

test("deux vehicules differents ne se chevauchent pas, meme cle et memes dates", () => {
  const { erreurs } = validerBaremes(
    document({
      parametres: [
        parametre({ cle: "vitesse_max", vehicule: "velo", unite: "KM_PAR_HEURE", usage: "rejet" }),
        parametre({ cle: "vitesse_max", vehicule: "voiture", unite: "KM_PAR_HEURE", usage: "rejet" }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
});

test("le chevauchement est detecte vehicule par vehicule", () => {
  const { erreurs } = validerBaremes(
    document({
      parametres: [
        parametre({
          cle: "vitesse_max",
          vehicule: "velo",
          valable_du: "2024-01-01",
          valable_au: "2024-12-31",
        }),
        parametre({ cle: "vitesse_max", vehicule: "velo", valable_du: "2024-06-01" }),
        parametre({ cle: "vitesse_max", vehicule: "voiture", valable_du: "2024-06-01" }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1, "seul le velo doit remonter");
  assert.match(erreurs[0], /vehicule=velo/);
});

test("deux zones differentes ne se chevauchent pas", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ cle: "prix_par_km", zone: "paris", unite: "EUR_PAR_KM" }),
        regle({ cle: "prix_par_km", zone: "hors_paris", unite: "EUR_PAR_KM" }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
});

test("la meme zone et la meme plateforme se chevauchent bien", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ cle: "prix_par_km", zone: "paris", unite: "EUR_PAR_KM" }),
        regle({ cle: "prix_par_km", zone: "paris", unite: "EUR_PAR_KM", valable_du: "2025-01-01" }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /plateformes=uber_eats zone=paris/);
});

test("une zone hors liste est refusee", () => {
  const { erreurs } = validerBaremes(document({ regles: [regle({ zone: "lyon" })] }), schema);

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /hors liste autorisee/);
});

/* ------------------------------------------------------------------ */
/* Date de debut inconnue                                              */
/* ------------------------------------------------------------------ */

test("une valeur constatee sans date d'entree en vigueur est acceptee", () => {
  const { erreurs, avertissements } = validerBaremes(
    document({
      regles: [
        regle({
          valable_du: null,
          precision_date: "Date d'entree en vigueur inconnue.",
        }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
  assert.deepEqual(avertissements, []);
});

test("une date de debut inconnue couvre tout le passe et bloque donc les periodes anterieures", () => {
  const { erreurs } = validerBaremes(
    document({
      regles: [
        regle({ valable_du: null, valable_au: null }),
        regle({ valable_du: "2024-01-01", valable_au: "2024-12-31" }),
      ],
    }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /chevauchement/);
  assert.match(erreurs[0], /origine/);
});

test("deux valeurs sans date de debut connue ne peuvent pas coexister", () => {
  const { erreurs } = validerBaremes(
    document({ regles: [regle({ valable_du: null }), regle({ valable_du: null })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /sans date de debut connue/);
});

test("une date de debut inconnue peut etre fermee et suivie d'une periode datee", () => {
  const { erreurs, avertissements } = validerBaremes(
    document({
      regles: [
        regle({ valable_du: null, valable_au: "2024-08-31" }),
        regle({ valable_du: "2024-09-01", valable_au: null }),
      ],
    }),
    schema
  );

  assert.deepEqual(erreurs, []);
  assert.deepEqual(avertissements, []);
});

/* ------------------------------------------------------------------ */
/* Regles legales                                                      */
/* ------------------------------------------------------------------ */

test("une regle legale ne peut pas servir de critere de rejet", () => {
  const { erreurs } = validerBaremes(document({ legales: [legale({ usage: "rejet" })] }), schema);

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /calcul/);
});

test("une regle legale exige la definition de ce que la valeur recouvre", () => {
  const incomplete = legale({});
  delete incomplete.definition;

  const { erreurs } = validerBaremes(document({ legales: [incomplete] }), schema);

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /"definition" absent/);
});

test("une regle legale n'accepte pas de plateforme : elle ne depend d'aucune", () => {
  const { erreurs } = validerBaremes(
    document({ legales: [legale({ plateformes: ["uber_eats"] })] }),
    schema
  );

  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /champ inconnu/);
});
