/**
 * Tests de l'outil de calibration.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Le point critique n'est pas que l'outil trouve des ancrages : c'est qu'il
 * n'en laisse jamais sortir autre chose. Un specimen prete par un collegue
 * livreur contient l'adresse d'un restaurant, celle d'un client, un horaire.
 * Ces tests lui soumettent des lectures piegees, ou le texte sensible est colle
 * au libelle attendu, et verifient que rien n'en ressort.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { enChamps, gabaritCandidat, reperer } from "../lib/calibration.ts";

const REGLES = {
  libellesAttendus: ["Durée", "Distance", "Accepter"],
  /* Non ancres aux extremites : le recapitulatif met duree et distance sur une
     meme ligne, « 16 min 34 s 11.18 km ». */
  motifs: {
    montant_euro: "\\d{1,4}[.,]\\d{2}\\s*€",
    distance_km: "\\d{1,3}[.,]?\\d{0,2}\\s*km\\b",
  },
  confianceMinimale: 60,
};

const mot = (texte, x, y, confiance = 90) => ({
  texte,
  zone: { x, y, largeur: 0.1, hauteur: 0.02 },
  confiance,
});

/* Des lectures telles qu'elles sortent vraiment : le libelle attendu colle a
   du texte qui ne doit jamais sortir. */
const LECTURE_PIEGEE = [
  mot("Durée du trajet — 18 Rue des Carrières", 0.1, 0.4),
  mot("Distance depuis Mûrs-Érigné", 0.5, 0.4),
  mot("Pepe Chicken By FastGoodCuisine — Angers", 0.1, 0.6),
  mot("49070 Saint-Lambert-la-Potherie, France", 0.1, 0.65),
  mot("8,08 €", 0.2, 0.3),
  mot("12,2 km", 0.2, 0.35),
];

/* Ce qui a le droit de figurer dans une sortie. */
const AUTORISE = new Set([
  ...REGLES.libellesAttendus,
  ...Object.keys(REGLES.motifs),
  ...REGLES.libellesAttendus.map((l) => l.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()),
]);

const chainesDe = (valeur, recolte = []) => {
  if (typeof valeur === "string") recolte.push(valeur);
  else if (Array.isArray(valeur)) for (const v of valeur) chainesDe(v, recolte);
  else if (valeur && typeof valeur === "object")
    for (const v of Object.values(valeur)) chainesDe(v, recolte);
  return recolte;
};

test("les ancrages attendus sont reperes malgre le texte parasite", () => {
  const ancrages = reperer(LECTURE_PIEGEE, REGLES);
  const cles = ancrages.map((a) => a.cle).sort();

  assert.ok(cles.includes("duree"), "le libelle Durée doit etre reconnu");
  assert.ok(cles.includes("distance"));
  assert.ok(cles.includes("montant_euro"), "une zone sans libelle s'ancre par sa forme");
});

test("aucune chaine issue de l'image ne sort de l'outil", () => {
  /* La garantie centrale : c'est l'entree de la liste blanche qui ressort,
     jamais la lecture. */
  const ancrages = reperer(LECTURE_PIEGEE, REGLES);

  for (const chaine of chainesDe(ancrages)) {
    assert.ok(
      AUTORISE.has(chaine),
      `chaine non autorisee dans la sortie : « ${chaine} »`
    );
  }
});

test("le gabarit candidat ecrit ne contient aucun texte lu non plus", () => {
  const gabarit = gabaritCandidat(
    { id: "essai", plateforme: "uber_eats", description: "specimen de test" },
    reperer(LECTURE_PIEGEE, REGLES)
  );

  const attendues = new Set([...AUTORISE, "essai", "uber_eats", "specimen de test"]);

  for (const chaine of chainesDe(gabarit)) {
    assert.ok(attendues.has(chaine), `chaine non autorisee dans le gabarit : « ${chaine} »`);
  }
});

test("aucune suite de chiffres ne subsiste dans la sortie", () => {
  /* Un montant, une distance, un code postal : rien de tout cela ne doit
     apparaitre. Seules les positions sont des nombres, et elles ne sont pas
     des chaines. */
  const gabarit = gabaritCandidat(
    { id: "essai", plateforme: "uber_eats", description: "specimen" },
    reperer(LECTURE_PIEGEE, REGLES)
  );

  for (const chaine of chainesDe(gabarit)) {
    assert.ok(
      !/\d{2,}/.test(chaine),
      `suite de chiffres dans la sortie : « ${chaine} »`
    );
  }
});

test("une lecture peu sure est ignoree plutot que retenue", () => {
  const flou = [mot("Durée", 0.1, 0.4, 40)];

  assert.deepEqual(reperer(flou, REGLES), [], "sous le seuil de confiance, on ne conclut pas");
});

test("un motif qui tombe sur un libelle deja retenu n'est pas double", () => {
  const ancrages = reperer([mot("12,2 km", 0.2, 0.35), mot("Distance", 0.2, 0.35)], REGLES);

  const zones = ancrages.map((a) => `${a.zone.x}-${a.zone.y}`);
  assert.equal(new Set(zones).size, zones.length, "une meme zone ne porte qu'un ancrage");
});

test("un motif de configuration invalide est ignore, pas fatal", () => {
  const ancrages = reperer([mot("8,08 €", 0.2, 0.3)], {
    ...REGLES,
    motifs: { casse: "([" },
  });

  assert.deepEqual(ancrages, []);
});

test("les champs produits sont utilisables tels quels par le controle de gabarit", () => {
  const champs = enChamps(reperer(LECTURE_PIEGEE, REGLES));

  for (const champ of champs) {
    assert.ok(champ.cle.length > 0);
    assert.ok(Array.isArray(champ.libelles));
    assert.ok(champ.zone.largeur > 0 && champ.zone.hauteur > 0);
    assert.ok(champ.libelles.length > 0 || champ.motif !== undefined, "un champ doit s'ancrer");
  }
});

test("un motif reconnait une grandeur au milieu d'une ligne partagee", () => {
  /* Cas reel : le recapitulatif affiche « 16 min 34 s 11.18 km » sur une ligne.
     Un motif ancre aux extremites n'y verrait rien. */
  const ancrages = reperer([mot("16 min 34 s 11.18 km", 0.1, 0.5)], REGLES);

  assert.deepEqual(
    ancrages.map((a) => a.motif),
    ["distance_km"]
  );

  for (const chaine of chainesDe(ancrages)) {
    assert.ok(AUTORISE.has(chaine), `chaine non autorisee : « ${chaine} »`);
  }
});
