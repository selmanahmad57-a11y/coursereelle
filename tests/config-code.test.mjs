/**
 * Tests d'alignement entre le code et la configuration.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Le code doit bien nommer quelque part les barèmes qu'il lit. Ces noms sont
 * rassemblés dans `lib/cles.ts` ; ce fichier vérifie que chacun désigne une
 * entrée qui existe vraiment. Renommer un barème sans mettre le code à jour
 * fait donc échouer les tests, au lieu de faire disparaître une valeur de
 * l'écran sans bruit.
 *
 * Il vérifie aussi `config/villes.json`, qui alimente la liste déroulante du
 * formulaire et la déduction de zone.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { lireJson } from "../scripts/valider-baremes.mjs";
import { CLES_ANNONCEES, CLES_LEGALES, CLES_SYSTEME, UNITES } from "../lib/cles.ts";
import {
  CODES_ANOMALIES,
  controlerCoherencePhysique,
} from "../lib/validation/regles-physiques.ts";
import { calculer } from "../lib/calculs.ts";
import { estEnVigueur } from "../lib/periodes.ts";

const chemin = (nom) => process.env[nom.env] ?? new URL(nom.defaut, import.meta.url);

const schema = await lireJson(
  chemin({ env: "BAREMES_SCHEMA", defaut: "../config/baremes.schema.json" })
);
const baremes = await lireJson(
  chemin({ env: "BAREMES_FICHIER", defaut: "../config/baremes.json" })
);
const libelles = await lireJson(
  chemin({ env: "LIBELLES_FICHIER", defaut: "../config/libelles.json" })
);
const villes = await lireJson(
  chemin({ env: "VILLES_FICHIER", defaut: "../config/villes.json" })
);

/* ------------------------------------------------------------------ */
/* Les cles nommees par le code existent dans la configuration          */
/* ------------------------------------------------------------------ */

const familles = [
  [CLES_SYSTEME, "parametres_systeme"],
  [CLES_LEGALES, "regles_legales"],
  [CLES_ANNONCEES, "regles_annoncees"],
];

for (const [cles, famille] of familles) {
  test(`chaque cle nommee par le code existe dans ${famille}`, () => {
    const presentes = new Set(baremes[famille].map((entree) => entree.cle));

    for (const [nom, cle] of Object.entries(cles)) {
      assert.ok(
        presentes.has(cle),
        `lib/cles.ts nomme "${nom}" -> "${cle}", absent de ${famille} dans config/baremes.json`
      );
    }
  });
}

test("chaque unite nommee par le code existe dans le schema", () => {
  const autorisees = new Set(schema.$defs.unite.enum);

  for (const [nom, unite] of Object.entries(UNITES)) {
    assert.ok(autorisees.has(unite), `lib/cles.ts nomme "${nom}" -> "${unite}", hors du schema`);
  }
});

test("chaque code d'anomalie a un message et une unite d'affichage", () => {
  assert.deepEqual([...CODES_ANOMALIES].sort(), Object.keys(libelles.anomalies).sort());

  const unitesConnues = new Set(Object.keys(libelles.unites));

  for (const [code, definition] of Object.entries(libelles.anomalies)) {
    assert.ok(definition.message.includes("{valeur}"), `${code} : {valeur} absent du message`);
    assert.ok(definition.message.includes("{limite}"), `${code} : {limite} absent du message`);
    assert.ok(unitesConnues.has(definition.unite), `${code} : unite inconnue ${definition.unite}`);
  }
});

/* ------------------------------------------------------------------ */
/* Villes                                                              */
/* ------------------------------------------------------------------ */

test("chaque ville a un slug unique, normalise, et un libelle", () => {
  const slugs = villes.villes.map((ville) => ville.slug);

  assert.equal(new Set(slugs).size, slugs.length, "slug en double");

  for (const ville of villes.villes) {
    assert.match(ville.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug non normalise : ${ville.slug}`);
    assert.ok(ville.libelle.length > 0, `libelle vide pour ${ville.slug}`);
  }
});

test("chaque ville pointe vers une zone que le schema connait", () => {
  const zones = new Set(schema.$defs.zone.enum);

  for (const ville of villes.villes) {
    assert.ok(zones.has(ville.zone), `${ville.slug} : zone inconnue "${ville.zone}"`);
  }
});

test("l'incertitude sur la petite couronne est documentee et appliquee", () => {
  assert.ok(
    villes.interpretation_zone.incertitude.length > 0,
    "l'incertitude sur la zone Paris doit rester ecrite quelque part"
  );

  const petiteCouronne = villes.villes.filter((ville) => ville.petite_couronne);

  assert.ok(petiteCouronne.length > 0, "les communes concernees doivent etre marquees");

  for (const ville of petiteCouronne) {
    assert.equal(
      ville.zone,
      "hors_paris",
      `${ville.slug} : le choix par defaut documente est hors_paris`
    );
  }
});

test("aucune granularite plus fine que la ville n'est collectee", () => {
  const interdits = ["quartier", "adresse", "code_postal", "arrondissement", "latitude"];

  for (const ville of villes.villes) {
    for (const champ of interdits) {
      assert.ok(!(champ in ville), `${ville.slug} : le champ "${champ}" est proscrit`);
    }
  }

  assert.ok(villes.granularite_maximale.regle.length > 0);
});

/* ------------------------------------------------------------------ */
/* Bout en bout, avec la configuration reelle du site                   */
/* ------------------------------------------------------------------ */

test("la course du dossier, jugee avec la configuration reelle, donne les chiffres annonces", () => {
  const date = "2026-09-03";

  const course = {
    prixPaye: 8.08,
    pourboire: null,
    distanceKm: 12.2,
    dureeReelleMinutes: 32,
    dureeEstimeeMinutes: 16,
  };

  const applicable = (entrees, filtre) =>
    entrees.filter(filtre).filter((e) => estEnVigueur(e, date));

  const [cotisations] = applicable(
    baremes.regles_legales,
    (e) => e.cle === CLES_LEGALES.tauxCotisations
  );
  assert.ok(cotisations, "le taux de cotisations doit etre en vigueur a cette date");

  const resultat = calculer(course, cotisations.valeur);

  const proche = (obtenu, attendu, tolerance = 0.01) =>
    assert.ok(
      Math.abs(obtenu - attendu) <= tolerance,
      `attendu ${attendu} (+/- ${tolerance}), obtenu ${obtenu}`
    );

  proche(resultat.tauxPlateforme, 15.15);
  proche(resultat.tauxPlateformeEstime, 30.3);
  proche(resultat.ecartRelatif, 100);
  proche(resultat.tauxPlateformeNet, 11.94, 0.02);

  /* Le meme calcul avec 3 € de pourboire : le chiffre comparable aux baremes ne bouge pas. */
  const avecPourboire = calculer({ ...course, pourboire: 3 }, cotisations.valeur);
  proche(avecPourboire.tauxPlateforme, 15.15);
  proche(avecPourboire.tauxAvecPourboire, 20.78, 0.02);

  const valeurSysteme = (cle, vehicule = null) => {
    const [entree] = applicable(
      baremes.parametres_systeme,
      (e) => e.cle === cle && (e.vehicule ?? null) === vehicule
    );
    return entree?.valeur ?? null;
  };

  const seuils = {
    distanceMinimale: valeurSysteme(CLES_SYSTEME.distanceMinimale),
    distanceMaximale: valeurSysteme(CLES_SYSTEME.distanceMaximale),
    vitesseMinimale: valeurSysteme(CLES_SYSTEME.vitesseMinimale),
    vitesseMaximale: valeurSysteme(CLES_SYSTEME.vitesseMaximale, "velo"),
  };

  assert.equal(seuils.vitesseMaximale, 25, "la vitesse max du velo doit venir de la config");
  assert.deepEqual(
    controlerCoherencePhysique(course, seuils),
    [],
    "22,9 km/h a velo reste possible : la course doit passer le filtre"
  );
});

test("une course payee sous le minimum annonce passe tous les filtres du site", () => {
  const date = "2026-09-03";

  const minimum = baremes.regles_annoncees.find(
    (e) => e.cle === CLES_ANNONCEES.minimumParCourse
  );
  assert.ok(minimum, "le minimum annonce doit exister pour servir de comparaison");
  assert.equal(minimum.usage, "comparaison", "et ne jamais servir a autre chose");

  const misere = {
    prixPaye: minimum.valeur - 0.4,
    pourboire: null,
    distanceKm: 12.2,
    dureeReelleMinutes: 32,
    dureeEstimeeMinutes: 16,
  };

  const applicable = (entrees, filtre) =>
    entrees.filter(filtre).filter((e) => estEnVigueur(e, date));

  const valeurSysteme = (cle, vehicule = null) => {
    const [entree] = applicable(
      baremes.parametres_systeme,
      (e) => e.cle === cle && (e.vehicule ?? null) === vehicule
    );
    return entree?.valeur ?? null;
  };

  assert.deepEqual(
    controlerCoherencePhysique(misere, {
      distanceMinimale: valeurSysteme(CLES_SYSTEME.distanceMinimale),
      distanceMaximale: valeurSysteme(CLES_SYSTEME.distanceMaximale),
      vitesseMinimale: valeurSysteme(CLES_SYSTEME.vitesseMinimale),
      vitesseMaximale: valeurSysteme(CLES_SYSTEME.vitesseMaximale, "velo"),
    }),
    [],
    "une course a 2,60 € est une preuve a publier, pas une erreur a filtrer"
  );
});

/* ------------------------------------------------------------------ */
/* Vocabulaires de la base et de la configuration                       */
/* ------------------------------------------------------------------ */

/*
 * Les plateformes, vehicules, zones et villes ne sont volontairement PAS
 * contraints en SQL : la configuration fait foi et l'API valide avant d'ecrire.
 * Restent les vocabulaires propres au cycle de vie en base, statut et categorie,
 * qui existent des deux cotes. Ce test empeche les deux listes de diverger.
 */

const sql = await readFile(
  process.env.SCHEMA_SQL ?? new URL("../sql/schema.sql", import.meta.url),
  "utf8"
);

const listesCheck = (colonne) =>
  [...sql.matchAll(new RegExp(`check \\(${colonne} in \\(([^)]*)\\)\\)`, "g"))].map((trouve) =>
    [...trouve[1].matchAll(/'([^']+)'/g)].map((valeur) => valeur[1]).sort()
  );

test("les statuts de la base et leurs libelles sont la meme liste", () => {
  const listes = listesCheck("statut");

  assert.ok(listes.length >= 1, "aucune contrainte de statut trouvee dans sql/schema.sql");

  for (const liste of listes) {
    assert.deepEqual(liste, Object.keys(libelles.statuts).sort());
  }
});

test("les categories de classification et leurs libelles sont la meme liste", () => {
  const [liste] = listesCheck("categorie");

  assert.ok(liste, "aucune contrainte de categorie trouvee dans sql/schema.sql");
  assert.deepEqual(liste, Object.keys(libelles.categories).sort());
});

test("le schema SQL ne contient aucune colonne identifiante", () => {
  const proscrits = [
    "adresse_ip",
    "ip_address",
    " ip ",
    "code_postal",
    "quartier",
    "arrondissement",
    "latitude",
    "longitude",
    "email",
    "telephone",
  ];

  const sansCommentaires = sql
    .split("\n")
    .filter((ligne) => !ligne.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();

  for (const terme of proscrits) {
    assert.ok(
      !sansCommentaires.includes(terme),
      `sql/schema.sql declare "${terme.trim()}" : aucune donnee identifiante ne doit pouvoir etre stockee`
    );
  }
});

test("la duree de retention des empreintes est un bareme, pas une valeur du SQL", () => {
  const retention = baremes.parametres_systeme.find((e) => e.cle === "retention_empreintes");

  assert.ok(retention, "le bareme retention_empreintes doit exister");
  assert.equal(retention.usage, "anti_fraude");
  assert.equal(retention.unite, "JOURS");

  const pause = baremes.parametres_systeme.find((e) => e.cle === "duree_pause_apres_echecs");
  assert.ok(
    retention.valeur * 24 >= pause.valeur,
    "la retention doit couvrir au moins la plus longue pause anti-fraude"
  );
});
