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
import { MOTIFS_REFUS } from "../lib/validation/anti-fraude.ts";
import { CHAMPS_VERIFIES, MOTIFS_OCR } from "../lib/validation/ocr.ts";
import { MOTIFS_CAPTURE } from "../lib/validation/capture.ts";
import { endpointR2, juridictionValide } from "../lib/r2-endpoint.ts";
import {
  analyserSoumissionCourse,
  CHAMPS_FACULTATIFS,
  CHAMPS_REQUIS,
} from "../lib/validation/soumission.ts";
import { CODES_SIGNALEMENT, MOTIFS_AUTHENTICITE } from "../lib/validation/authenticite.ts";
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
const provenance = await lireJson(
  chemin({ env: "PROVENANCE_FICHIER", defaut: "../config/provenance.json" })
);
const gabarits = await lireJson(
  chemin({ env: "GABARITS_FICHIER", defaut: "../config/gabarits.json" })
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

test("les statuts de la base sont tous connus, et tous les libelles servent", () => {
  const listes = listesCheck("statut");
  const connus = Object.keys(libelles.statuts).sort();

  assert.ok(listes.length >= 1, "aucune contrainte de statut trouvee dans sql/schema.sql");

  /* Courses et sessions n'ont pas le meme cycle de vie : une session ne porte pas
     de capture, donc jamais d'attente de lecture. Chaque table declare donc un
     sous-ensemble, et l'union doit couvrir exactement les libelles. */
  const union = new Set();

  for (const liste of listes) {
    for (const statut of liste) {
      assert.ok(connus.includes(statut), `statut sans libelle : ${statut}`);
      union.add(statut);
    }
  }

  assert.deepEqual([...union].sort(), connus, "un libelle de statut n'est utilise nulle part");
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

/* ------------------------------------------------------------------ */
/* Motifs normalises des filtres                                        */
/* ------------------------------------------------------------------ */

test("chaque motif de refus anti-fraude a un libelle", () => {
  assert.deepEqual(
    [...MOTIFS_REFUS].sort(),
    Object.keys(libelles.motifs_anti_fraude).sort(),
    "un motif sans libelle s'afficherait sous son code dans le tableau de surveillance"
  );
});

test("chaque motif de rejet OCR a un libelle", () => {
  assert.deepEqual([...MOTIFS_OCR].sort(), Object.keys(libelles.motifs_ocr).sort());
});

test("les champs verifies par l'OCR sont ceux qui figurent sur un recapitulatif", () => {
  /* Le temps reel n'y est pas, et ne doit jamais y entrer : c'est precisement ce
     que la plateforme ne montre pas, donc rien ne permet de le verifier. */
  assert.ok(
    !CHAMPS_VERIFIES.includes("dureeReelleMinutes"),
    "le temps reel n'est pas verifiable par OCR, il est fiabilise par la masse"
  );
  assert.deepEqual([...CHAMPS_VERIFIES].sort(), [
    "distanceKm",
    "dureeEstimeeMinutes",
    "prixEuros",
  ]);
});

test("chaque motif de refus de capture a un libelle", () => {
  assert.deepEqual([...MOTIFS_CAPTURE].sort(), Object.keys(libelles.motifs_capture).sort());
});

test("les formats de capture declarent tous un type MIME et des extensions", async () => {
  const captures = await lireJson(
    process.env.CAPTURES_FICHIER ?? new URL("../config/captures.json", import.meta.url)
  );

  const tous = [...captures.formats_acceptes, ...captures.formats_refuses];

  for (const format of tous) {
    assert.match(format.type_mime, /^image\/[a-z0-9+.-]+$/, `type MIME invalide : ${format.type_mime}`);
    assert.ok(format.extensions.length > 0, `${format.type_mime} : aucune extension`);
    for (const extension of format.extensions) {
      assert.match(extension, /^\.[a-z0-9]+$/, `extension non normalisee : ${extension}`);
    }
  }

  const acceptes = new Set(captures.formats_acceptes.map((f) => f.type_mime));
  for (const refuse of captures.formats_refuses) {
    assert.ok(
      !acceptes.has(refuse.type_mime),
      `${refuse.type_mime} ne peut pas etre a la fois accepte et refuse`
    );
    assert.ok(
      captures.decision[refuse.cle_explication],
      `${refuse.type_mime} : cle_explication "${refuse.cle_explication}" absente de decision`
    );
  }
});

test("les tolerances OCR sont declarees par champ, prix a zero", () => {
  const tolerance = (cle) => baremes.parametres_systeme.find((e) => e.cle === cle);

  assert.equal(tolerance(CLES_SYSTEME.tolerancePrix).valeur, 0, "le prix est la valeur probante");
  assert.ok(tolerance(CLES_SYSTEME.toleranceDistance).valeur > 0);
  assert.ok(tolerance(CLES_SYSTEME.toleranceDureeEstimee).valeur > 0);
});

/* ------------------------------------------------------------------ */
/* Controles d'authenticite : configuration livree                      */
/* ------------------------------------------------------------------ */

test("chaque motif d'authenticite a un libelle", () => {
  assert.deepEqual(
    [...MOTIFS_AUTHENTICITE].sort(),
    Object.keys(libelles.motifs_authenticite).sort()
  );
});

test("les types de source generative sont des URI du vocabulaire IPTC", async () => {
  const provenance = await lireJson(
    process.env.PROVENANCE_FICHIER ?? new URL("../config/provenance.json", import.meta.url)
  );

  assert.ok(provenance.types_source_generative.length > 0);

  for (const type of provenance.types_source_generative) {
    assert.match(
      type,
      /^http:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/[A-Za-z]+$/,
      `type de source hors vocabulaire IPTC : ${type}`
    );
  }
});

test("aucun nom de logiciel generatif n'est devine", () => {
  /* Les chaines exactes ecrites par chaque generateur doivent etre relevees sur de
     vrais fichiers. Y mettre des noms devines produirait des rejets faux ET des
     rejets manques. La liste reste donc vide jusqu'a observation. */
  assert.deepEqual(
    provenance.logiciels_generatifs,
    [],
    "a remplir depuis de vrais fichiers, jamais de memoire"
  );
  assert.ok(provenance.note_maintenance.length > 0);
});

test("aucun gabarit n'est enregistre avant calibrage, et le controle ne rejette donc rien", () => {
  assert.deepEqual(
    gabarits.gabarits,
    [],
    "les gabarits se relevent sur de vraies captures, en semaine 5"
  );
  assert.ok(gabarits.decision.prudence.length > 0);
});

test("la page Methode annonce la limite avant les controles", () => {
  const section = libelles.methode.authenticite;

  for (const partie of ["aveu", "controles", "protection", "conclusion"]) {
    assert.ok(section[partie]?.length > 0, `${partie} manquant`);
  }

  assert.match(
    section.aveu,
    /aucune vérification ne peut prouver/i,
    "la limite doit etre enoncee en clair, c'est ce qui rend le reste credible"
  );
});

/* ------------------------------------------------------------------ */
/* Asymetrie de calibrage                                               */
/* ------------------------------------------------------------------ */

test("chaque code de signalement a un libelle", () => {
  assert.deepEqual([...CODES_SIGNALEMENT].sort(), Object.keys(libelles.signalements).sort());
});

test("les codes de signalement du SQL et du code sont la meme liste", () => {
  const [liste] = listesCheck("code");

  assert.ok(liste, "aucune contrainte de code trouvee dans sql/schema.sql");
  assert.deepEqual(liste, [...CODES_SIGNALEMENT].sort());
});

test("le seuil qui rejette est plus strict que celui qui surveille", () => {
  const seuil = (cle) => baremes.parametres_systeme.find((e) => e.cle === cle);

  const rejet = seuil(CLES_SYSTEME.distancePerceptuelleRejet);
  const surveillance = seuil(CLES_SYSTEME.distancePerceptuelleSurveillance);

  assert.equal(rejet.usage, "rejet");
  assert.equal(surveillance.usage, "surveillance");
  assert.ok(
    rejet.valeur < surveillance.valeur,
    "un seuil de rejet plus large que la bande de surveillance n'aurait aucun sens"
  );
});

test("aucun seuil d'usage surveillance ne peut ecarter une course", () => {
  /* L'asymetrie, verifiee plutot que promise : ce qui surveille ne rejette pas. */
  const surveillance = baremes.parametres_systeme.filter((e) => e.usage === "surveillance");

  assert.ok(surveillance.length > 0);

  for (const parametre of surveillance) {
    assert.notEqual(parametre.usage, "rejet");
    assert.ok(
      parametre.justification.length > 0,
      `${parametre.cle} : un seuil de surveillance doit dire pourquoi il peut etre large`
    );
  }
});

/* ------------------------------------------------------------------ */
/* Endpoint R2 selon la juridiction                                     */
/* ------------------------------------------------------------------ */

test("un bucket en juridiction n'a pas la meme adresse qu'un bucket ordinaire", () => {
  const compte = "0123456789abcdef0123456789abcdef";

  assert.equal(
    endpointR2(compte, "default"),
    `https://${compte}.r2.cloudflarestorage.com`
  );
  assert.equal(
    endpointR2(compte, "eu"),
    `https://${compte}.eu.r2.cloudflarestorage.com`,
    "se tromper ici renvoie un Access Denied qui ressemble a un probleme de droits"
  );
});

test("une juridiction inconnue ou absente retombe sur l'adresse ordinaire", () => {
  assert.equal(juridictionValide(undefined), "default");
  assert.equal(juridictionValide(""), "default");
  assert.equal(juridictionValide("europe"), "default");
  assert.equal(juridictionValide("eu"), "eu");
});

test("la juridiction est documentee dans .env.example", async () => {
  const exemple = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(exemple, /^R2_JURIDICTION=/m, "une variable non documentee est une variable oubliee");
});

/* ------------------------------------------------------------------ */
/* Champs facultatifs et types de capture                               */
/* ------------------------------------------------------------------ */

test("aucun champ ne peut etre a la fois requis et facultatif", () => {
  for (const champ of CHAMPS_FACULTATIFS) {
    assert.ok(
      !CHAMPS_REQUIS.includes(champ),
      `${champ} est declare facultatif ET requis : la soumission serait incoherente`
    );
  }
});

test("une course sans duree affichee reste acceptable", async () => {
  const villes = await lireJson(
    process.env.VILLES_FICHIER ?? new URL("../config/villes.json", import.meta.url)
  );

  const { course, erreurs } = analyserSoumissionCourse(
    {
      date_course: "2026-09-03",
      plateforme: "uber_eats",
      vehicule: "velo",
      ville: "angers",
      distance_km: "12,2",
      prix_paye_euros: "8,08",
      duree_reelle_minutes: "32",
    },
    {
      plateformes: schema.$defs.plateforme.enum,
      vehicules: schema.$defs.vehicule.enum,
      villes: villes.villes.map((v) => v.slug),
      villeAutre: "autre",
    }
  );

  assert.deepEqual(erreurs, [], "l'ecran d'acceptation n'affiche pas la duree");
  assert.equal(course.dureeEstimeeMinutes, null);
  assert.equal(course.prixPayeEuros, 8.08);
});

test("le prix, lui, reste obligatoire", () => {
  const { course, erreurs } = analyserSoumissionCourse(
    {
      date_course: "2026-09-03",
      plateforme: "uber_eats",
      vehicule: "velo",
      ville: "angers",
      distance_km: "12,2",
      duree_reelle_minutes: "32",
    },
    { plateformes: ["uber_eats"], vehicules: ["velo"], villes: ["angers"], villeAutre: "autre" }
  );

  assert.equal(course, null);
  assert.ok(erreurs.some((e) => e.champ === "prix_paye_euros"));
});

test("chaque type de capture ne promet que des champs que l'OCR sait verifier", async () => {
  const captures = await lireJson(
    process.env.CAPTURES_FICHIER ?? new URL("../config/captures.json", import.meta.url)
  );

  const cles = captures.types.liste.map((type) => type.cle);

  assert.ok(
    cles.includes(captures.types.prefere),
    "le type prefere doit exister dans la liste"
  );

  for (const type of captures.types.liste) {
    assert.ok(libelles.types_capture[type.cle], `${type.cle} : libelle manquant`);
    assert.ok(type.champs_prouves.length > 0, `${type.cle} : ne prouve rien`);

    for (const champ of type.champs_prouves) {
      assert.ok(
        CHAMPS_VERIFIES.includes(champ),
        `${type.cle} promet « ${champ} », que l'OCR ne verifie pas`
      );
    }
  }
});

test("l'ecran d'acceptation ne promet pas la duree, le recapitulatif si", async () => {
  /* La distinction est la raison d'etre des deux gabarits : demander une duree a
     un ecran qui ne l'affiche pas produirait un rejet injuste. */
  const captures = await lireJson(
    process.env.CAPTURES_FICHIER ?? new URL("../config/captures.json", import.meta.url)
  );

  const par = Object.fromEntries(
    captures.types.liste.map((type) => [type.cle, type.champs_prouves])
  );

  assert.ok(
    par.recapitulatif_details.includes("dureeEstimeeMinutes"),
    "le recapitulatif Details affiche la duree"
  );
  assert.ok(
    !par.ecran_acceptation.includes("dureeEstimeeMinutes"),
    "l'ecran d'acceptation ne l'affiche pas"
  );

  /* Ce que les deux prouvent en commun, c'est ce qui compte le plus. */
  for (const cle of Object.keys(par)) {
    assert.ok(par[cle].includes("prixEuros"), `${cle} doit prouver le prix`);
    assert.ok(par[cle].includes("distanceKm"), `${cle} doit prouver la distance`);
  }
});
