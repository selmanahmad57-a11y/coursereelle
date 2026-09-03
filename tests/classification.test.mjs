/**
 * Tests de la classification des courses validées.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ce module range des courses selon ce que les plateformes annoncent. Le danger
 * n'est pas qu'il se trompe de case : c'est qu'il glisse du constat au reproche.
 * Deux garanties sont donc vérifiées ici plutôt que promises — un barème annoncé
 * ne peut jamais faire disparaître une course, et « temps estimé incohérent »
 * ne parle que de ce que l'application affiche, jamais du temps vécu.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CATEGORIES, classer, prixSelonGrille } from "../lib/classification.ts";
import { CLES_ANNONCEES, GROUPES_ANNONCES } from "../lib/cles.ts";

const baremes = JSON.parse(await readFile("config/baremes.json", "utf8"));

/* La grille réellement annoncée hors Paris, telle que la configuration la porte. */
const GRILLE = {
  retraitFixe: 2,
  parKm: 0.85,
  remiseFixe: 1,
  fraisServicePourcent: 5,
};

const REGLES = { minimumParCourse: 3, grille: GRILLE, vitesseMaximale: 80 };

const categoriesDe = (classements) => classements.map((c) => c.categorie).sort();

test("la grille annoncee donne un prix calculable et refaisable", () => {
  /* 2 € de retrait + 0,85 × 12,2 km + 1 € de remise = 13,37 €, moins 5 % de
     frais de service. Le lecteur doit pouvoir refaire l'operation. */
  assert.equal(prixSelonGrille(12.2, GRILLE).toFixed(4), "12.7015");
});

test("une grille incomplete ne produit aucun prix plutot qu'un prix partiel", () => {
  /* Completer une grille annoncee avec ce qu'on croit savoir d'elle reviendrait
     a reprocher a une plateforme un bareme qu'elle n'a pas publie. */
  for (const manquant of Object.keys(GRILLE)) {
    const trouee = { ...GRILLE, [manquant]: null };
    assert.equal(prixSelonGrille(12.2, trouee), null, `${manquant} absent`);
  }
});

test("la course de reference est classee sous la grille, avec ses deux chiffres", () => {
  const classements = classer(
    { prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: null },
    REGLES
  );

  assert.deepEqual(categoriesDe(classements), ["sous_grille_kilometrique"]);

  const [classement] = classements;
  assert.equal(classement.cleBareme, GROUPES_ANNONCES.grilleKilometrique);
  assert.equal(classement.valeurConstatee, 8.08);
  assert.equal(classement.valeurBareme.toFixed(2), "12.70");
});

test("une course peut cumuler deux ecarts, et les porte tous les deux", () => {
  const classements = classer(
    { prixEuros: 2.6, distanceKm: 3, dureeEstimeeMinutes: null },
    REGLES
  );

  assert.deepEqual(categoriesDe(classements), [
    "sous_grille_kilometrique",
    "sous_minimum_annonce",
  ]);
});

test("une course qui atteint la grille est conforme, et n'invoque aucun bareme", () => {
  const classements = classer(
    { prixEuros: 12.71, distanceKm: 12.2, dureeEstimeeMinutes: null },
    REGLES
  );

  assert.deepEqual(categoriesDe(classements), ["conforme"]);
  assert.equal(classements[0].cleBareme, null, "la base refuse un conforme qui cite un bareme");
});

test("« temps estime incoherent » decrit l'application, jamais le livreur", () => {
  /*
   * Onze kilometres annonces en quatre minutes font 165 km/h implicites :
   * l'application publie une estimation intenable pour une voiture. C'est ce
   * seul constat que la categorie porte.
   */
  const classements = classer(
    { prixEuros: 20, distanceKm: 11, dureeEstimeeMinutes: 4 },
    REGLES
  );

  assert.ok(categoriesDe(classements).includes("temps_estime_incoherent"));

  const trouve = classements.find((c) => c.categorie === "temps_estime_incoherent");
  assert.equal(Math.round(trouve.valeurConstatee), 165);
  assert.equal(trouve.valeurBareme, 80);
});

test("un temps vecu tres superieur a l'estimation n'est pas une incoherence", () => {
  /*
   * LE POINT LE PLUS IMPORTANT DE CE MODULE. Une course estimee 16 minutes et
   * vecue 32 est exactement ce que le site mesure et publie — un ecart, pas une
   * anomalie. Classer cela « incoherent » reviendrait a mettre en doute une
   * donnee declarative course par course, alors que le temps vecu se fiabilise
   * par la masse. Le temps vecu n'entre donc pas dans ce module : il n'y a
   * meme pas de champ pour le recevoir.
   */
  const classements = classer(
    { prixEuros: 20, distanceKm: 5, dureeEstimeeMinutes: 16 },
    REGLES
  );

  assert.equal(categoriesDe(classements).includes("temps_estime_incoherent"), false);
});

test("sans duree affichee, la categorie ne se prononce pas", () => {
  const classements = classer(
    { prixEuros: 20, distanceKm: 11, dureeEstimeeMinutes: null },
    REGLES
  );

  assert.equal(categoriesDe(classements).includes("temps_estime_incoherent"), false);
});

test("aucun bareme annonce cite par la classification n'a un usage de rejet", () => {
  /*
   * La garantie structurelle du projet : les regles annoncees par les
   * plateformes ne sont jamais des criteres de rejet. Une course payee 2,60 €
   * est une preuve a publier, pas une erreur a filtrer. Ce test l'attache aux
   * barèmes que la classification consulte vraiment.
   */
  const cites = [
    CLES_ANNONCEES.minimumParCourse,
    CLES_ANNONCEES.retraitFixe,
    CLES_ANNONCEES.remunerationParKm,
    CLES_ANNONCEES.remiseFixe,
    CLES_ANNONCEES.fraisService,
  ];

  for (const cle of cites) {
    const entrees = baremes.regles_annoncees.filter((regle) => regle.cle === cle);

    assert.ok(entrees.length > 0, `bareme annonce introuvable : ${cle}`);

    for (const entree of entrees) {
      assert.equal(entree.usage, "comparaison", `${cle} : un bareme annonce ne rejette pas`);
    }
  }
});

test("toutes les categories du code existent dans la base et dans les libelles", async () => {
  const schema = await readFile("sql/schema.sql", "utf8");
  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));

  for (const categorie of CATEGORIES) {
    assert.ok(schema.includes(`'${categorie}'`), `categorie absente du schema : ${categorie}`);
    assert.ok(libelles.categories[categorie], `categorie sans libelle : ${categorie}`);
  }

  assert.deepEqual(
    [...CATEGORIES].sort(),
    Object.keys(libelles.categories).sort(),
    "le code et les libelles doivent connaitre exactement les memes categories"
  );
});

test("chaque classement porte une unite connue, ou aucune valeur", async () => {
  /*
   * Les deux valeurs d'un classement n'ont pas toujours la meme nature : des
   * euros pour un manque a gagner, des kilometres par heure pour une estimation
   * intenable. Afficher l'une avec l'unite de l'autre ferait mentir la preuve
   * que le classement est cense porter.
   */
  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));

  const cas = [
    { prixEuros: 2.6, distanceKm: 3, dureeEstimeeMinutes: null },
    { prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: null },
    { prixEuros: 20, distanceKm: 11, dureeEstimeeMinutes: 4 },
    { prixEuros: 12.71, distanceKm: 12.2, dureeEstimeeMinutes: null },
  ];

  for (const course of cas) {
    for (const classement of classer(course, REGLES)) {
      const porteUneValeur =
        classement.valeurBareme !== null || classement.valeurConstatee !== null;

      if (!porteUneValeur) {
        assert.equal(classement.unite, null, `${classement.categorie} : unite sans valeur`);
        continue;
      }

      assert.ok(
        libelles.unites[classement.unite],
        `${classement.categorie} : unite inconnue « ${classement.unite} »`
      );
    }
  }
});

test("deux classifications identiques ne produisent pas de nouvelle generation", async () => {
  const { memeClassification } = await import("../lib/classification.ts");

  const course = { prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: null };
  const a = classer(course, REGLES);
  const b = classer(course, REGLES);

  assert.equal(memeClassification(a, b), true);
  /* L'ordre ne fait pas la difference : ce sont des ensembles. */
  assert.equal(memeClassification(a, [...b].reverse()), true);
});

test("un ecart au-dela de la precision de la base fait une generation nouvelle", async () => {
  const { memeClassification } = await import("../lib/classification.ts");

  const avant = classer({ prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: null }, REGLES);
  const apres = classer(
    { prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: null },
    { ...REGLES, grille: { ...GRILLE, parKm: 0.9 } }
  );

  assert.equal(memeClassification(avant, apres), false, "une grille corrigee doit se voir");
});

test("un ecart en deca de la precision de la base n'en fait pas une", async () => {
  /*
   * Les colonnes sont en numeric(10, 4) : un ecart sur la cinquieme decimale
   * disparait a l'ecriture. Le traiter comme un changement ferait grossir
   * l'historique d'evenements que la base n'a jamais enregistres.
   */
  const { memeClassification } = await import("../lib/classification.ts");

  const a = [
    {
      categorie: "sous_grille_kilometrique",
      cleBareme: "grille_kilometrique",
      valeurBareme: 12.70152,
      valeurConstatee: 8.08,
      unite: "EUR_PAR_COURSE",
    },
  ];
  const b = [{ ...a[0], valeurBareme: 12.70151 }];

  assert.equal(memeClassification(a, b), true);
});

test("une course rejetee n'est jamais classee", async () => {
  /*
   * Ranger une course rejetee « sous la grille » reviendrait a tirer une
   * conclusion d'une donnee dont on vient de dire qu'elle n'etait pas verifiee.
   */
  const { classerCourse } = await import("../lib/traitement-lecture.ts");

  const course = {
    id: "essai",
    cleR2: "captures/essai.png",
    dateCourse: "2026-09-01",
    contexte: { plateforme: "uber_eats", zone: "hors_paris", vehicule: "voiture" },
    saisie: { prixEuros: 8.08, distanceKm: 12.2, dureeEstimeeMinutes: null },
  };

  const regles = { reglesClassification: () => REGLES };

  assert.deepEqual(
    classerCourse(course, { statut: "rejetee_auto" }, regles),
    [],
    "un rejet ne produit aucun classement"
  );

  assert.deepEqual(
    categoriesDe(classerCourse(course, { statut: "validee_auto" }, regles)),
    ["sous_grille_kilometrique"]
  );
});
