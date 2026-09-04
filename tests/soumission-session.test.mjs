/**
 * Tests de la soumission d'une session.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Une session n'a pas de preuve : rien ne confirme le temps de connexion, qui
 * n'apparaît sur aucun récapitulatif. Elle est déclarative de bout en bout, et
 * c'est assumé — sa fiabilité viendra du nombre. Raison de plus pour que ce que
 * le formulaire accepte soit exactement ce que la base peut recevoir.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analyserSoumissionSession,
  CHAMPS_FACULTATIFS_SESSION,
  CHAMPS_REQUIS_SESSION,
} from "../lib/validation/soumission-session.ts";
import { MOTIFS_SOUMISSION } from "../lib/validation/soumission.ts";

const VOCABULAIRES = {
  plateformes: ["uber_eats", "deliveroo"],
  vehicules: ["velo", "voiture"],
  villes: ["angers", "nantes"],
  villeAutre: "autre",
};

const COMPLETE = {
  date_session: "2026-09-04",
  ville: "angers",
  plateforme: "uber_eats",
  vehicule: "voiture",
  heure_connexion: "11:30",
  heure_deconnexion: "15:45",
  nombre_courses: "7",
  revenu_total_euros: "48,20",
  minutes_en_course: "155",
};

test("une session complete est acceptee, et ses horodatages assembles", () => {
  const { session, erreurs } = analyserSoumissionSession(COMPLETE, VOCABULAIRES);

  assert.deepEqual(erreurs, []);
  assert.equal(session.connexionLe, "2026-09-04T11:30:00.000Z");
  assert.equal(session.deconnexionLe, "2026-09-04T15:45:00.000Z");
  assert.equal(session.nombreCourses, 7);
  assert.equal(session.revenuTotalEuros, 48.2);
  assert.equal(session.minutesEnCourse, 155);
});

test("une session qui traverse minuit ajoute le jour toute seule", () => {
  /*
   * Le livreur saisit l'heure qu'il a lue, pas une date. Lui demander de
   * comprendre que sa déconnexion appartient au lendemain, c'est lui demander
   * de faire le travail que le code peut faire.
   */
  const { session } = analyserSoumissionSession(
    { ...COMPLETE, heure_connexion: "21:00", heure_deconnexion: "01:30" },
    VOCABULAIRES
  );

  assert.equal(session.connexionLe, "2026-09-04T21:00:00.000Z");
  assert.equal(session.deconnexionLe, "2026-09-05T01:30:00.000Z");
});

test("le vehicule et le temps en course restent facultatifs", () => {
  /* Toutes les applications ne donnent pas le temps en course. L'exiger
     reviendrait à choisir l'échantillon plutôt qu'à le recevoir. */
  const { session, erreurs } = analyserSoumissionSession(
    { ...COMPLETE, vehicule: "", minutes_en_course: "" },
    VOCABULAIRES
  );

  assert.deepEqual(erreurs, []);
  assert.equal(session.vehicule, null);
  assert.equal(session.minutesEnCourse, null);
});

test("chaque champ requis manquant est nomme, pas devine", () => {
  const { session, erreurs } = analyserSoumissionSession({}, VOCABULAIRES);

  assert.equal(session, null);

  for (const champ of CHAMPS_REQUIS_SESSION) {
    assert.ok(
      erreurs.some((e) => e.champ === champ && e.motif === "champ_absent"),
      `champ requis non signale : ${champ}`
    );
  }
});

test("une heure illisible est refusee avec son propre motif", () => {
  const { erreurs } = analyserSoumissionSession(
    { ...COMPLETE, heure_connexion: "25:00", heure_deconnexion: "onze heures" },
    VOCABULAIRES
  );

  assert.deepEqual(
    erreurs.map((e) => `${e.champ}:${e.motif}`).sort(),
    ["heure_connexion:heure_invalide", "heure_deconnexion:heure_invalide"].sort()
  );
});

test("une ville hors liste exige sa saisie libre", () => {
  const sans = analyserSoumissionSession(
    { ...COMPLETE, ville: "autre", ville_libre: "" },
    VOCABULAIRES
  );
  assert.deepEqual(sans.erreurs, [{ champ: "ville_libre", motif: "champ_absent" }]);

  const avec = analyserSoumissionSession(
    { ...COMPLETE, ville: "autre", ville_libre: "Saint-Herblain" },
    VOCABULAIRES
  );
  assert.equal(avec.session.villeSlug, null);
  assert.equal(avec.session.villeLibre, "Saint-Herblain");
});

test("tous les motifs employes ont un libelle, et tous les champs aussi", async () => {
  /* Un motif sans traduction s'affiche en code technique au livreur — le défaut
     qui a déjà coûté un « [object Object] » à l'écran. */
  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));

  for (const motif of MOTIFS_SOUMISSION) {
    assert.ok(libelles.motifs_soumission[motif], `motif sans libelle : ${motif}`);
  }

  for (const champ of [...CHAMPS_REQUIS_SESSION, ...CHAMPS_FACULTATIFS_SESSION, "ville", "ville_libre"]) {
    assert.ok(libelles.champs_soumission[champ], `champ sans libelle : ${champ}`);
  }
});

test("la route ecrit exactement les colonnes que la table declare", async () => {
  const route = await readFile("app/api/sessions/route.ts", "utf8");
  const schema = await readFile("sql/schema.sql", "utf8");

  const insertion = route.slice(route.indexOf("insert into sessions"));
  const colonnes = insertion
    .slice(insertion.indexOf("(") + 1, insertion.indexOf(")"))
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");

  assert.ok(colonnes.length > 0);

  for (const colonne of colonnes) {
    assert.ok(
      new RegExp(`\\b${colonne}\\b`).test(schema),
      `colonne absente du schema : ${colonne}`
    );
  }
});
