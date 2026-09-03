/**
 * Tests des controles d'authenticite : provenance, empreinte perceptuelle, gabarit.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Aucun de ces controles ne prouve qu'une capture est authentique. Les tests
 * verifient donc autant ce qu'ils attrapent que ce qu'ils laissent passer sans
 * bruit — en particulier qu'un gabarit inconnu ne rejette rien.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { controlerAuthenticite } from "../lib/validation/authenticite.ts";
import {
  distanceHamming,
  empreinteImage,
  longueurEnBits,
  trouverSimilaires,
} from "../lib/validation/empreinte-image.ts";
import { controlerGabarit } from "../lib/validation/gabarit.ts";
import { detecterProvenanceIa } from "../lib/validation/provenance.ts";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

const REGLES_PROVENANCE = {
  typesSourceGenerative: [
    "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
  ],
  logicielsGeneratifs: ["ImageGenerator 3"],
};

const METADONNEES_PROPRES = {
  typeSourceNumerique: null,
  logiciel: "Android 14",
  manifestesC2pa: [],
};

test("un type de source IPTC generatif est detecte", () => {
  const indice = detecterProvenanceIa(
    {
      ...METADONNEES_PROPRES,
      typeSourceNumerique:
        "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
    },
    REGLES_PROVENANCE
  );

  assert.equal(indice.origine, "type_source_numerique");
});

test("un manifeste C2PA qui declare une origine generative est detecte", () => {
  const indice = detecterProvenanceIa(
    {
      ...METADONNEES_PROPRES,
      manifestesC2pa: [
        {
          emetteur: "un generateur",
          typeSourceNumerique:
            "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
        },
      ],
    },
    REGLES_PROVENANCE
  );

  assert.equal(indice.origine, "manifeste_c2pa");
});

test("un logiciel createur reconnu est detecte, quelle que soit la casse", () => {
  const indice = detecterProvenanceIa(
    { ...METADONNEES_PROPRES, logiciel: "imagegenerator 3 (beta)" },
    REGLES_PROVENANCE
  );

  assert.equal(indice.origine, "logiciel_createur");
  assert.equal(indice.valeur, "imagegenerator 3 (beta)", "la valeur brute part en surveillance");
});

test("une capture ordinaire ne declenche rien", () => {
  assert.equal(detecterProvenanceIa(METADONNEES_PROPRES, REGLES_PROVENANCE), null);
});

test("l'absence totale de metadonnees ne vaut pas preuve d'authenticite", () => {
  const vide = { typeSourceNumerique: null, logiciel: null, manifestesC2pa: [] };

  assert.equal(
    detecterProvenanceIa(vide, REGLES_PROVENANCE),
    null,
    "null signifie « aucun indice », jamais « capture authentique »"
  );
});

/* ------------------------------------------------------------------ */
/* Empreinte perceptuelle                                              */
/* ------------------------------------------------------------------ */

/*
 * Huit lignes de neuf colonnes : soixante-quatre bits.
 *
 * Les luminances sont tirees d'un generateur deterministe plutot que d'une
 * formule arithmetique : une progression reguliere produirait une image
 * monotone ligne par ligne, donc une empreinte de bits tous identiques, et deux
 * images sans rapport se ressembleraient parfaitement.
 */
const luminances = (graine) => {
  let etat = graine;
  const suivant = () => {
    etat = (etat * 1103515245 + 12345) % 2147483648;
    return etat % 256;
  };
  return Array.from({ length: 8 }, () => Array.from({ length: 9 }, suivant));
};

/* Transformation monotone croissante : c'est ce que fait un eclaircissement. */
const eclaircir = (matrice) => matrice.map((ligne) => ligne.map((v) => v * 0.7 + 40));

const CAPTURE = luminances(7);
const CAPTURE_ECLAIRCIE = eclaircir(CAPTURE);
const AUTRE_CAPTURE = luminances(99);

test("une empreinte de 8 par 9 fait bien 64 bits", () => {
  assert.equal(longueurEnBits(empreinteImage(CAPTURE)), 64);
});

test("la meme image donne la meme empreinte", () => {
  assert.equal(empreinteImage(CAPTURE), empreinteImage(CAPTURE));
  assert.equal(distanceHamming(empreinteImage(CAPTURE), empreinteImage(CAPTURE)), 0);
});

test("un changement global de luminosite ne change pas l'empreinte", () => {
  /* C'est tout l'interet du dHash : il encode le sens des variations, pas les niveaux. */
  assert.equal(
    distanceHamming(empreinteImage(CAPTURE), empreinteImage(CAPTURE_ECLAIRCIE)),
    0,
    "la meme capture reenregistree ou eclaircie doit rester reconnaissable"
  );
});

test("une image reellement differente donne une empreinte eloignee", () => {
  const distance = distanceHamming(empreinteImage(CAPTURE), empreinteImage(AUTRE_CAPTURE));

  assert.ok(distance > 5, `deux images distinctes doivent s'ecarter, distance obtenue : ${distance}`);
});

test("deux empreintes incomparables ne produisent aucune conclusion", () => {
  assert.equal(distanceHamming("abcd", "abcdef"), null);
  assert.equal(distanceHamming("", ""), null);
  assert.equal(distanceHamming("zzzz", "abcd"), null);
});

test("une matrice trop etroite est refusee plutot que mal calculee", () => {
  assert.throws(() => empreinteImage([[1]]));
  assert.throws(() => empreinteImage([[1, 2, 3], [1, 2]]));
});

test("la recherche de similaires respecte le seuil, et le desactive a null", () => {
  const empreinte = empreinteImage(CAPTURE);
  const eclaircie = empreinteImage(CAPTURE_ECLAIRCIE);
  const autre = empreinteImage(AUTRE_CAPTURE);

  const trouves = trouverSimilaires(empreinte, [autre, eclaircie], 5);

  assert.equal(trouves.length, 1);
  assert.equal(trouves[0].empreinte, eclaircie);
  assert.deepEqual(trouverSimilaires(empreinte, [eclaircie], null), []);
});

/* ------------------------------------------------------------------ */
/* Gabarit                                                             */
/* ------------------------------------------------------------------ */

const GABARIT = {
  id: "uber-eats-2026-clair",
  plateforme: "uber_eats",
  description: "fixture de test, ne represente aucune capture reelle",
  champs: [
    {
      cle: "total",
      libelles: ["Total", "Montant total"],
      zone: { x: 0.6, y: 0.1, largeur: 0.3, hauteur: 0.1 },
    },
    {
      cle: "distance",
      libelles: ["Distance"],
      zone: { x: 0.1, y: 0.4, largeur: 0.3, hauteur: 0.1 },
    },
  ],
};

const TEXTES_CONFORMES = [
  { texte: "Total", x: 0.7, y: 0.15 },
  { texte: "Distance parcourue", x: 0.2, y: 0.45 },
];

test("sans gabarit connu pour la plateforme, rien n'est rejete", () => {
  const verdict = controlerGabarit("uber_eats", TEXTES_CONFORMES, [], 0.05);

  assert.equal(verdict.conforme, true);
  assert.equal(verdict.reconnu, null, "on ne rejette pas ce qu'on n'a pas appris a reconnaitre");
});

test("une capture conforme au gabarit est reconnue", () => {
  const verdict = controlerGabarit("uber_eats", TEXTES_CONFORMES, [GABARIT], 0.05);

  assert.equal(verdict.conforme, true);
  assert.equal(verdict.reconnu.id, GABARIT.id);
});

test("un libelle attendu et introuvable fait echouer, en nommant le champ", () => {
  const verdict = controlerGabarit(
    "uber_eats",
    [{ texte: "Total", x: 0.7, y: 0.15 }],
    [GABARIT],
    0.05
  );

  assert.equal(verdict.conforme, false);
  assert.deepEqual(verdict.manquants, ["distance"]);
});

test("un libelle correct mais au mauvais endroit fait echouer", () => {
  const verdict = controlerGabarit(
    "uber_eats",
    [
      { texte: "Total", x: 0.05, y: 0.9 },
      { texte: "Distance", x: 0.2, y: 0.45 },
    ],
    [GABARIT],
    0.05
  );

  assert.equal(verdict.conforme, false);
  assert.deepEqual(verdict.manquants, ["total"]);
});

test("la tolerance absorbe un leger decalage, et la casse et les accents sont ignores", () => {
  const verdict = controlerGabarit(
    "uber_eats",
    [
      { texte: "TOTAL", x: 0.58, y: 0.08 },
      { texte: "DISTANCE", x: 0.09, y: 0.38 },
    ],
    [GABARIT],
    0.05
  );

  assert.equal(verdict.conforme, true);
});

test("un gabarit d'une autre plateforme ne s'applique pas", () => {
  const verdict = controlerGabarit("deliveroo", [], [GABARIT], 0.05);

  assert.equal(verdict.conforme, true);
  assert.equal(verdict.reconnu, null);
});

/* ------------------------------------------------------------------ */
/* Les trois controles reunis                                          */
/* ------------------------------------------------------------------ */

const REGLES = {
  provenance: REGLES_PROVENANCE,
  gabarits: [GABARIT],
  toleranceGabarit: 0.05,
  distancePerceptuelleMaximale: 5,
};

const CAPTURE_PROPRE = {
  metadonnees: METADONNEES_PROPRES,
  empreinte: empreinteImage(CAPTURE),
  empreintesConnues: [],
  plateforme: "uber_eats",
  textes: TEXTES_CONFORMES,
};

test("une capture ordinaire passe les trois controles", () => {
  assert.equal(controlerAuthenticite(CAPTURE_PROPRE, REGLES), null);
});

test("la provenance est examinee en premier", () => {
  const refus = controlerAuthenticite(
    {
      ...CAPTURE_PROPRE,
      metadonnees: { ...METADONNEES_PROPRES, logiciel: "ImageGenerator 3" },
      empreintesConnues: [CAPTURE_PROPRE.empreinte],
    },
    REGLES
  );

  assert.equal(refus.motif, "provenance_ia");
});

test("la meme capture retouchee et resoumise est reconnue", () => {
  const refus = controlerAuthenticite(
    { ...CAPTURE_PROPRE, empreintesConnues: [empreinteImage(CAPTURE_ECLAIRCIE)] },
    REGLES
  );

  assert.equal(refus.motif, "capture_deja_soumise");
  assert.equal(refus.similaires[0].distance, 0);
});

test("une mise en page approximative est rejetee avec le champ fautif", () => {
  const refus = controlerAuthenticite(
    { ...CAPTURE_PROPRE, textes: [{ texte: "Remuneration percue", x: 0.7, y: 0.15 }] },
    REGLES
  );

  assert.equal(refus.motif, "gabarit_non_reconnu");
  assert.ok(refus.gabarit.manquants.includes("total"));
});

test("sans gabarit calibre, seuls provenance et similarite operent", () => {
  const refus = controlerAuthenticite(
    { ...CAPTURE_PROPRE, textes: [] },
    { ...REGLES, gabarits: [] }
  );

  assert.equal(refus, null, "l'etat au lancement : le gabarit ne rejette rien");
});

test("les accents sont vraiment neutralises des deux cotes", () => {
  const gabaritAccentue = {
    id: "test-accents",
    plateforme: "uber_eats",
    description: "fixture",
    champs: [
      {
        cle: "remuneration",
        libelles: ["Rémunération"],
        zone: { x: 0.1, y: 0.1, largeur: 0.3, hauteur: 0.1 },
      },
    ],
  };

  const sansAccent = controlerGabarit(
    "uber_eats",
    [{ texte: "REMUNERATION DE LA COURSE", x: 0.2, y: 0.15 }],
    [gabaritAccentue],
    0.05
  );
  const avecAccent = controlerGabarit(
    "uber_eats",
    [{ texte: "rémunération de la course", x: 0.2, y: 0.15 }],
    [gabaritAccentue],
    0.05
  );

  assert.equal(sansAccent.conforme, true, "l'OCR rend souvent le texte sans accents");
  assert.equal(avecAccent.conforme, true);
});
