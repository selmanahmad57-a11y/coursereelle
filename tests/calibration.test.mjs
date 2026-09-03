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

import {
  deduireType,
  enChamps,
  gabaritCandidat,
  promouvable,
  reperer,
} from "../lib/calibration.ts";
import { TYPES_RELATION } from "../lib/validation/gabarit.ts";

/* Tolerance d'alignement du gabarit de test. En production elle vient du bareme
   date `tolerance_meme_ligne` ; ici c'est une donnee de fixture, choisie assez
   large pour que les mots poses a la meme hauteur forment bien une ligne. */
const TOLERANCE_LIGNE = 0.02;

/* Ce que chaque ecran prouve, et par quel motif chaque champ se lit. En
   production ces deux tables viennent de config/captures.json et de
   config/interface-uber.json. */
const REGLES_TYPE = {
  motifsParChamp: {
    prixEuros: "montant_euro",
    distanceKm: "distance_km",
    dureeEstimeeMinutes: "duree_min_sec",
  },
  champsProuves: {
    recapitulatif_details: ["prixEuros", "distanceKm", "dureeEstimeeMinutes"],
    ecran_acceptation: ["prixEuros", "distanceKm"],
  },
};

/* Un ancrage de forme reduit a ce dont la deduction se sert. */
const ancrageDe = (motif) => ({
  cle: motif,
  motif,
  zone: { x: 0.2, y: 0.3, largeur: 0.1, hauteur: 0.02 },
  confiance: 90,
});

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
    reperer(LECTURE_PIEGEE, REGLES),
    TOLERANCE_LIGNE,
    REGLES_TYPE
  );

  /*
   * Les relations ajoutent leur propre vocabulaire a la sortie. Il vient de
   * TYPES_RELATION, une liste fermee du modele : l'autoriser ici ne perce pas la
   * garantie, puisqu'un type issu de l'image ne s'y trouverait pas.
   */
  const attendues = new Set([
    ...AUTORISE,
    ...TYPES_RELATION,
    /* Le type deduit et les champs ancres sont eux aussi du vocabulaire ferme :
       ils viennent des tables de configuration, jamais de l'image. */
    ...Object.keys(REGLES_TYPE.champsProuves),
    ...Object.keys(REGLES_TYPE.motifsParChamp),
    "essai",
    "uber_eats",
    "specimen de test",
  ]);

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
    reperer(LECTURE_PIEGEE, REGLES),
    TOLERANCE_LIGNE,
    REGLES_TYPE
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
    /* Une colonne, et rien d'autre : la hauteur mesuree ne fait plus partie du
       gabarit, parce qu'elle depend de l'endroit ou le livreur a defile. */
    assert.equal(champ.zone, undefined, "un champ ne transporte plus de zone");
    assert.ok(champ.x > 0 && champ.x < 1, "la colonne est une fraction de la largeur");
    assert.ok(champ.libelles.length > 0 || champ.motif !== undefined, "un champ doit s'ancrer");
  }
});

test("chaque relation ne relie que des champs que le gabarit declare", () => {
  /* Une relation qui nommerait un champ absent du gabarit ne serait jamais
     evaluee : elle passerait pour tenue sans que rien ne l'ait verifiee. */
  const gabarit = gabaritCandidat(
    { id: "essai", plateforme: "uber_eats", description: "specimen" },
    reperer(LECTURE_PIEGEE, REGLES),
    TOLERANCE_LIGNE,
    REGLES_TYPE
  );

  const cles = new Set(gabarit.champs.map((champ) => champ.cle));

  assert.ok(gabarit.relations.length > 0, "un specimen a plusieurs ancrages a un agencement");

  for (const relation of gabarit.relations) {
    assert.ok(TYPES_RELATION.includes(relation.type), `type inconnu : ${relation.type}`);
    assert.ok(cles.has(relation.champ), `champ inconnu : ${relation.champ}`);
    assert.ok(cles.has(relation.autre), `champ inconnu : ${relation.autre}`);
    assert.notEqual(relation.champ, relation.autre, "un champ ne se relie pas a lui-meme");
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

test("le type se deduit de ce que la capture porte", () => {
  const recapitulatif = deduireType(
    ["montant_euro", "distance_km", "duree_min_sec"].map(ancrageDe),
    REGLES_TYPE
  );

  /* Les deux types sont satisfaits, mais le plus exigeant l'emporte : ce qu'il
     prouve en plus a bien ete vu. */
  assert.deepEqual(recapitulatif.possibles.sort(), ["ecran_acceptation", "recapitulatif_details"]);
  assert.equal(recapitulatif.type, "recapitulatif_details");
});

test("sans duree, la capture ne prouve que ce qu'un ecran d'acceptation prouve", () => {
  const verdict = deduireType(["montant_euro", "distance_km"].map(ancrageDe), REGLES_TYPE);

  assert.equal(verdict.type, "ecran_acceptation");
  assert.deepEqual(verdict.champsAncres, ["prixEuros", "distanceKm"]);
});

test("une capture qui ne porte pas de quoi prouver un type n'en recoit aucun", () => {
  /* Un prix seul ne suffit a aucun des deux ecrans. Lui coller le type le plus
     probable serait une etiquette inventee, et elle se propagerait au gabarit. */
  const verdict = deduireType([ancrageDe("montant_euro")], REGLES_TYPE);

  assert.equal(verdict.type, null);
  assert.deepEqual(verdict.possibles, []);
  assert.deepEqual(verdict.champsAncres, ["prixEuros"]);

  assert.equal(deduireType([], REGLES_TYPE).type, null);
});

test("la limite de la deduction est consignee, pas masquee", () => {
  /*
   * Un recapitulatif defile au-dela de sa duree ne porte plus que prix et
   * distance : il sera classe comme ecran d'acceptation. C'est une erreur
   * possible, et c'est pourquoi le candidat consigne les champs ancres — le
   * classement se relit sans avoir a redemander la capture.
   */
  const gabarit = gabaritCandidat(
    { id: "essai", plateforme: "uber_eats", description: "specimen" },
    reperer(LECTURE_PIEGEE, REGLES),
    TOLERANCE_LIGNE,
    REGLES_TYPE
  );

  assert.equal(gabarit.typeCapture, "ecran_acceptation");
  assert.deepEqual(gabarit.champsAncres, ["prixEuros", "distanceKm"]);
});

test("un champ ancre par libelle seul ne prouve rien", () => {
  /* La deduction ne s'appuie que sur les motifs de forme : un libelle « Duree »
     dit qu'un ecran nomme la duree, pas qu'il en affiche une lisible. */
  const parLibelle = reperer([mot("Durée", 0.1, 0.4), mot("Distance", 0.5, 0.4)], REGLES);

  assert.deepEqual(deduireType(parLibelle, REGLES_TYPE).champsAncres, []);
});

/* Le plancher de promotion : trois ancrages, dont au moins un champ probant. En
   production le nombre vient du bareme date `ancrages_minimum_gabarit` et la
   liste des probants de `politique_verification.probants`. */
const REGLES_PROMOTION = { ancragesMinimum: 3, champsProbants: ["prixEuros", "distanceKm"] };

const candidatDe = (nombreDAncrages, champsAncres) => ({
  id: "essai",
  plateforme: "uber_eats",
  description: "specimen",
  typeCapture: null,
  champsAncres,
  champs: Array.from({ length: nombreDAncrages }, (_, index) => ({
    cle: `champ_${index}`,
    libelles: [],
    x: 0.1 * (index + 1),
  })),
  relations: [],
});

test("trois ancrages dont un champ probant : le candidat est promouvable", () => {
  const verdict = promouvable(candidatDe(3, ["prixEuros"]), REGLES_PROMOTION);

  assert.equal(verdict.promouvable, true);
  assert.deepEqual(verdict.motifs, []);
});

test("deux ancrages ne verifient qu'un segment, ce qui ne verifie rien", () => {
  /* Deux ancrages ne sont lies que par une relation : une structure satisfaite
     par hasard aussi bien que fabriquee a dessein. */
  const verdict = promouvable(candidatDe(2, ["prixEuros", "distanceKm"]), REGLES_PROMOTION);

  assert.equal(verdict.promouvable, false);
  assert.deepEqual(verdict.motifs, ["trop_peu_d_ancrages"]);
});

test("un gabarit sans champ probant certifierait une apparence", () => {
  const verdict = promouvable(candidatDe(9, ["dureeEstimeeMinutes"]), REGLES_PROMOTION);

  assert.equal(verdict.promouvable, false);
  assert.deepEqual(verdict.motifs, ["aucun_champ_probant"]);
});

test("aucun reglage ne peut lever l'exigence d'un champ probant", () => {
  /*
   * Le nombre d'ancrages est un bareme : il se regle, et il pourrait un jour
   * tomber a zero. L'exigence d'un champ probant, elle, est ecrite dans le
   * modele — un gabarit qui ne reconnait que des champs declaratifs validerait
   * la mise en page d'ecrans qui ne prouvent rien. Ce test interdit qu'une
   * valeur de configuration la contourne.
   */
  const permissif = { ancragesMinimum: 0, champsProbants: ["prixEuros", "distanceKm"] };

  assert.equal(promouvable(candidatDe(9, []), permissif).promouvable, false);
  assert.deepEqual(promouvable(candidatDe(0, []), permissif).motifs, ["aucun_champ_probant"]);
});
