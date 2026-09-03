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
  classerSimilarites,
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
/* Deux bandes de similarite                                            */
/* ------------------------------------------------------------------ */

/*
 * Empreintes fabriquees a la main, pour raisonner sur des distances exactes.
 * Sur 64 bits : 0x3 vaut deux bits, 0xf en vaut quatre, 0xff en vaut huit.
 */
const REFERENCE = "0000000000000000";
const A_DEUX_BITS = "0000000000000003";
const A_QUATRE_BITS = "000000000000000f";
const A_HUIT_BITS = "00000000000000ff";
const A_NEUF_BITS = "00000000000001ff";

const SEUILS_DISTANCE = { rejet: 2, surveillance: 8 };

test("les distances fabriquees valent bien ce qu'on croit", () => {
  assert.equal(distanceHamming(REFERENCE, A_DEUX_BITS), 2);
  assert.equal(distanceHamming(REFERENCE, A_QUATRE_BITS), 4);
  assert.equal(distanceHamming(REFERENCE, A_HUIT_BITS), 8);
  assert.equal(distanceHamming(REFERENCE, A_NEUF_BITS), 9);
});

test("seul le quasi identique est tenu pour la meme capture", () => {
  const { identiques, aSurveiller } = classerSimilarites(
    REFERENCE,
    [REFERENCE, A_DEUX_BITS, A_QUATRE_BITS, A_HUIT_BITS, A_NEUF_BITS],
    SEUILS_DISTANCE
  );

  assert.deepEqual(
    identiques.map((c) => c.distance),
    [0, 2],
    "au-dela de deux bits, on ne peut plus affirmer que c'est la meme capture"
  );
  assert.deepEqual(
    aSurveiller.map((c) => c.distance),
    [4, 8],
    "la bande de surveillance observe sans rien couter au livreur"
  );
});

test("au-dela de la bande de surveillance, plus rien n'est retenu", () => {
  const { identiques, aSurveiller } = classerSimilarites(
    REFERENCE,
    [A_NEUF_BITS],
    SEUILS_DISTANCE
  );

  assert.deepEqual(identiques, []);
  assert.deepEqual(aSurveiller, []);
});

/* ------------------------------------------------------------------ */
/* Les trois controles reunis                                          */
/* ------------------------------------------------------------------ */

const REGLES = {
  provenance: REGLES_PROVENANCE,
  gabarits: [GABARIT],
  toleranceGabarit: 0.05,
  distancesPerceptuelles: SEUILS_DISTANCE,
};

const CAPTURE_PROPRE = {
  metadonnees: METADONNEES_PROPRES,
  empreinte: REFERENCE,
  empreintesConnues: [],
  plateforme: "uber_eats",
  textes: TEXTES_CONFORMES,
};

test("une capture ordinaire passe les trois controles", () => {
  const resultat = controlerAuthenticite(CAPTURE_PROPRE, REGLES);

  assert.equal(resultat.refus, null);
  assert.deepEqual(resultat.signalements, []);
});

test("deux courses differentes du meme gabarit ne sont PAS rejetees, seulement signalees", () => {
  /*
   * Le cas qui compte vraiment. Toutes nos captures montrent la meme interface :
   * meme mise en page, memes libelles, memes aplats, seuls quelques chiffres
   * changent. Deux courses parfaitement legitimes tombent donc naturellement a
   * quelques bits l'une de l'autre. Les rejeter serait le pire echec possible
   * pour un site qui vit de la participation.
   */
  const resultat = controlerAuthenticite(
    { ...CAPTURE_PROPRE, empreintesConnues: [A_QUATRE_BITS] },
    REGLES
  );

  assert.equal(resultat.refus, null, "une course legitime ne doit jamais tomber ici");
  assert.equal(resultat.signalements.length, 1);
  assert.equal(resultat.signalements[0].code, "similarite_perceptuelle");
  assert.equal(resultat.signalements[0].valeur, 4);
  assert.equal(resultat.signalements[0].reference, A_QUATRE_BITS);
});

test("la meme capture retouchee et resoumise est, elle, rejetee", () => {
  const resultat = controlerAuthenticite(
    { ...CAPTURE_PROPRE, empreintesConnues: [A_DEUX_BITS] },
    REGLES
  );

  assert.equal(resultat.refus.motif, "doublon_perceptuel");
  assert.equal(resultat.refus.similaires[0].distance, 2);
});

test("un eclaircissement de la meme capture reste a distance nulle", () => {
  const resultat = controlerAuthenticite(
    {
      ...CAPTURE_PROPRE,
      empreinte: empreinteImage(CAPTURE),
      empreintesConnues: [empreinteImage(CAPTURE_ECLAIRCIE)],
    },
    REGLES
  );

  assert.equal(resultat.refus.motif, "doublon_perceptuel");
  assert.equal(resultat.refus.similaires[0].distance, 0);
});

test("la provenance est examinee en premier", () => {
  const resultat = controlerAuthenticite(
    {
      ...CAPTURE_PROPRE,
      metadonnees: { ...METADONNEES_PROPRES, logiciel: "ImageGenerator 3" },
      empreintesConnues: [A_DEUX_BITS],
    },
    REGLES
  );

  assert.equal(resultat.refus.motif, "provenance_ia");
});

test("une mise en page approximative est rejetee avec le champ fautif", () => {
  const resultat = controlerAuthenticite(
    { ...CAPTURE_PROPRE, textes: [{ texte: "Remuneration percue", x: 0.7, y: 0.15 }] },
    REGLES
  );

  assert.equal(resultat.refus.motif, "gabarit_non_reconnu");
  assert.ok(resultat.refus.gabarit.manquants.includes("total"));
});

test("un signalement survit au rejet : les deux sont rapportes ensemble", () => {
  const resultat = controlerAuthenticite(
    {
      ...CAPTURE_PROPRE,
      empreintesConnues: [A_QUATRE_BITS],
      textes: [{ texte: "Remuneration percue", x: 0.7, y: 0.15 }],
    },
    REGLES
  );

  assert.equal(resultat.refus.motif, "gabarit_non_reconnu");
  assert.equal(resultat.signalements.length, 1, "la surveillance ne doit rien perdre");
});

test("sans gabarit calibre, seuls provenance et similarite operent", () => {
  const resultat = controlerAuthenticite(
    { ...CAPTURE_PROPRE, textes: [] },
    { ...REGLES, gabarits: [] }
  );

  assert.equal(resultat.refus, null, "l'etat au lancement : le gabarit ne rejette rien");
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
