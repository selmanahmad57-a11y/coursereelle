/**
 * Tests des statistiques robustes.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ces tests ne verifient pas seulement des formules : ils demontrent l'affirmation
 * que la page Methode fait publiquement — une soumission frauduleuse ne peut pas
 * alterer les chiffres publies. Si l'un d'eux tombe un jour, c'est la promesse
 * du site qui est en cause, pas seulement le code.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ecartType,
  exclureAberrantes,
  mediane,
  moyenne,
  quantile,
  resumer,
} from "../lib/statistiques.ts";

/*
 * Generateur deterministe : les tests doivent donner le meme resultat a chaque
 * execution. La somme de deux tirages uniformes donne une distribution en
 * triangle, centree — plus proche de ce que produit une vraie serie de taux
 * horaires qu'un tirage uniforme, qui etalerait la masse jusqu'aux bords.
 */
const suite = (graine, nombre, minimum, maximum) => {
  let etat = graine;
  const uniforme = () => {
    etat = (etat * 1103515245 + 12345) % 2147483648;
    return etat / 2147483648;
  };
  return Array.from(
    { length: nombre },
    () => minimum + ((uniforme() + uniforme()) / 2) * (maximum - minimum)
  );
};

/* Cinq cents courses honnetes, entre 8 et 22 €/h, la plupart autour de 15. */
const HONNETES = suite(42, 500, 8, 22);

const SEUILS = { ecartsTypes: 3, effectifMinimal: 100 };

/* ------------------------------------------------------------------ */
/* Fondations                                                          */
/* ------------------------------------------------------------------ */

test("la mediane coupe la serie en deux, effectif pair comme impair", () => {
  assert.equal(mediane([1, 2, 3]), 2);
  assert.equal(mediane([1, 2, 3, 4]), 2.5);
  assert.equal(mediane([5]), 5);
  assert.equal(mediane([]), null);
});

test("les quartiles encadrent la mediane", () => {
  const valeurs = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  assert.equal(quantile(valeurs, 0.25), 3);
  assert.equal(quantile(valeurs, 0.5), 5);
  assert.equal(quantile(valeurs, 0.75), 7);
});

test("moyenne et ecart-type refusent de repondre sans donnees", () => {
  assert.equal(moyenne([]), null);
  assert.equal(ecartType([]), null);
  assert.equal(ecartType([4]), null, "un seul point n'a pas de dispersion");
});

/* ------------------------------------------------------------------ */
/* La promesse publique                                                */
/* ------------------------------------------------------------------ */

test("vingt fausses courses extravagantes ne deplacent pas la mediane, mais deplacent la moyenne", () => {
  /* Une campagne qui tente de faire croire a une remuneration effondree. */
  const contaminees = [...HONNETES, ...Array.from({ length: 20 }, () => 0.5)];

  const medianeAvant = mediane(HONNETES);
  const medianeApres = mediane(contaminees);
  const moyenneAvant = moyenne(HONNETES);
  const moyenneApres = moyenne(contaminees);

  const deplacementMediane = Math.abs(medianeApres - medianeAvant);
  const deplacementMoyenne = Math.abs(moyenneApres - moyenneAvant);

  assert.ok(
    deplacementMediane < 0.25,
    `la mediane ne doit quasiment pas bouger, elle a bouge de ${deplacementMediane.toFixed(3)}`
  );
  assert.ok(
    deplacementMoyenne > deplacementMediane * 3,
    "la moyenne, elle, encaisse la contamination : c'est pourquoi elle n'est pas publiee"
  );
});

test("le filtre des trois ecarts-types ecarte les valeurs extravagantes des statistiques", () => {
  const contaminees = [...HONNETES, ...Array.from({ length: 20 }, () => 900)];

  const { retenues, exclues } = exclureAberrantes(contaminees, SEUILS.ecartsTypes);

  assert.equal(exclues.length, 20);
  assert.ok(exclues.every((valeur) => valeur === 900));
  assert.equal(retenues.length, HONNETES.length);
});

test("une contamination assez discrete pour passer le filtre reste sans effet sur la mediane", () => {
  /* 7 €/h : plausible, donc non ecarte par le filtre, et pourtant faux. */
  const contaminees = [...HONNETES, ...Array.from({ length: 20 }, () => 7)];

  const { exclues } = exclureAberrantes(contaminees, SEUILS.ecartsTypes);
  assert.equal(exclues.length, 0, "cette fraude-la traverse bien le filtre");

  const deplacement = Math.abs(mediane(contaminees) - mediane(HONNETES));

  assert.ok(
    deplacement < 0.25,
    `c'est la mediane qui protege ici, et elle n'a bouge que de ${deplacement.toFixed(3)}`
  );
});

test("sur un petit lot, la meme fraude ferait basculer le chiffre", () => {
  /* La raison d'etre du seuil de publication : sans lui, vingt fausses courses
     domineraient une ville qui n'en compte que trente. */
  const petitLot = HONNETES.slice(0, 30);
  const contamine = [...petitLot, ...Array.from({ length: 20 }, () => 6)];

  const deplacement = Math.abs(mediane(contamine) - mediane(petitLot));

  assert.ok(deplacement > 1, "d'ou le seuil de publication, qui interdit d'afficher ce chiffre");

  assert.equal(
    resumer(petitLot, SEUILS).publiable,
    false,
    "trente courses ne suffisent pas pour publier"
  );
});

/* ------------------------------------------------------------------ */
/* Resume                                                              */
/* ------------------------------------------------------------------ */

test("le resume publie la mediane, compte les exclus et sait s'il a le droit de parler", () => {
  const contaminees = [...HONNETES, ...Array.from({ length: 20 }, () => 900)];
  const resume = resumer(contaminees, SEUILS);

  assert.equal(resume.effectif, 500);
  assert.equal(resume.effectifExclu, 20);
  assert.equal(resume.publiable, true);
  assert.ok(resume.premierQuartile < resume.mediane);
  assert.ok(resume.mediane < resume.troisiemeQuartile);
});

test("sans seuil de publication connu, rien n'est publiable", () => {
  const resume = resumer(HONNETES, { ecartsTypes: 3, effectifMinimal: null });

  assert.equal(resume.publiable, false, "l'absence de seuil ne vaut pas autorisation");
});

test("une serie vide ne produit aucun chiffre plutot qu'un zero trompeur", () => {
  const resume = resumer([], SEUILS);

  assert.equal(resume.effectif, 0);
  assert.equal(resume.mediane, null);
  assert.equal(resume.publiable, false);
});
