#!/usr/bin/env node
/**
 * Outil de calibration des gabarits.
 *
 * Usage : npm run calibrer
 *          npm run calibrer -- --depuis ~/Downloads --type recapitulatif_details
 *
 * Deux façons de fournir des spécimens.
 *
 * La première : les déposer dans calibration/entrees/ en nommant chaque fichier :
 *
 *     <plateforme>__<type_de_capture>__<description>.<png|jpg|webp>
 *     uber_eats__ecran_acceptation__android-15-sombre.png
 *
 * La seconde, quand ils viennent d'un téléphone et portent des noms illisibles :
 * pointer le dossier avec --depuis. Les images y sont COPIÉES dans
 * calibration/entrees/ sous un nom conforme, puis traitées. Les originaux ne
 * sont pas touchés : ils sont chez vous, à vous de les effacer.
 *
 * L'outil lit chaque fichier, en tire un gabarit candidat, écrit celui-ci dans
 * calibration/candidats/, PUIS SUPPRIME LE SPÉCIMEN. À la fin, il vérifie que
 * le dossier d'entrée est vide et échoue s'il ne l'est pas.
 *
 * POURQUOI CETTE DISCIPLINE. Un spécimen prêté par un collègue livreur est une
 * capture de production : adresse du restaurant, adresse du client, horaire. La
 * personne qui l'a prêté n'a rien choisi de publier. Un dossier calibration/ qui
 * accumulerait des captures serait la version disque du problème qu'on vient de
 * fermer ailleurs — ce qui a servi est détruit.
 *
 * CE QUI SORT D'ICI. Jamais le texte lu. Quand un libellé de la liste blanche
 * est reconnu, c'est l'entrée de la LISTE qui est écrite ; une zone que rien ne
 * nomme n'est décrite que par la forme attendue et sa position. Aucune chaîne
 * issue de l'image ne traverse cet outil, et `tests/calibration.test.mjs` le
 * vérifie sur des lectures piégées.
 */

import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { gabaritCandidat, reperer } from "../lib/calibration.ts";

const racine = new URL("../", import.meta.url).pathname;
const entrees = path.join(racine, "calibration", "entrees");
const candidats = path.join(racine, "calibration", "candidats");
const cache = path.join(racine, "calibration");

const lireJson = async (chemin) => JSON.parse(await readFile(chemin, "utf8"));

const interfaceUber = await lireJson(path.join(racine, "config", "interface-uber.json"));
const schema = await lireJson(path.join(racine, "config", "baremes.schema.json"));
const captures = await lireJson(path.join(racine, "config", "captures.json"));

const plateformesConnues = schema.$defs.plateforme.enum;
const typesConnus = captures.types.liste.map((type) => type.cle);

/* La note explicative vit a cote des motifs dans la configuration : on la retire
   avant de traiter le reste comme des expressions. */
const motifs = Object.fromEntries(
  Object.entries(interfaceUber.motifs).filter(([nom]) => nom !== "note")
);

const regles = {
  libellesAttendus: interfaceUber.libelles_attendus,
  motifs,
  confianceMinimale: interfaceUber.confiance_minimale,
};

/** Assemble les mots d'une même ligne : un montant est souvent coupé en deux. */
const lignesEtMots = (tsv, largeur, hauteur) => {
  const mots = [];
  const parLigne = new Map();

  for (const ligne of tsv.split("\n").slice(1)) {
    const colonnes = ligne.split("\t");
    if (colonnes[0] !== "5") continue;

    const texte = (colonnes[11] ?? "").trim();
    if (texte === "") continue;

    const boite = {
      gauche: Number(colonnes[6]),
      haut: Number(colonnes[7]),
      largeur: Number(colonnes[8]),
      hauteur: Number(colonnes[9]),
    };
    const confiance = Number(colonnes[10]);

    mots.push({
      texte,
      confiance,
      zone: {
        x: boite.gauche / largeur,
        y: boite.haut / hauteur,
        largeur: boite.largeur / largeur,
        hauteur: boite.hauteur / hauteur,
      },
    });

    const cle = `${colonnes[2]}-${colonnes[3]}-${colonnes[4]}`;
    const groupe = parLigne.get(cle) ?? { textes: [], boites: [], confiances: [] };
    groupe.textes.push(texte);
    groupe.boites.push(boite);
    groupe.confiances.push(confiance);
    parLigne.set(cle, groupe);
  }

  for (const groupe of parLigne.values()) {
    const gauche = Math.min(...groupe.boites.map((b) => b.gauche));
    const haut = Math.min(...groupe.boites.map((b) => b.haut));
    const droite = Math.max(...groupe.boites.map((b) => b.gauche + b.largeur));
    const bas = Math.max(...groupe.boites.map((b) => b.haut + b.hauteur));

    mots.push({
      texte: groupe.textes.join(" "),
      confiance: groupe.confiances.reduce((s, c) => s + c, 0) / groupe.confiances.length,
      zone: {
        x: gauche / largeur,
        y: haut / hauteur,
        largeur: (droite - gauche) / largeur,
        hauteur: (bas - haut) / hauteur,
      },
    });
  }

  return mots;
};

const identite = (nom) => {
  const base = nom.replace(/\.[^.]+$/, "");
  const parts = base.split("__");

  if (parts.length !== 3) return { erreur: "nom attendu : plateforme__type__description" };
  if (!plateformesConnues.includes(parts[0])) return { erreur: `plateforme inconnue : ${parts[0]}` };
  if (!typesConnus.includes(parts[1])) return { erreur: `type de capture inconnu : ${parts[1]}` };

  return {
    id: `${parts[0]}-${parts[1]}-${parts[2]}`,
    plateforme: parts[0],
    type: parts[1],
    description: parts[2].replace(/-/g, " "),
  };
};

await mkdir(entrees, { recursive: true });
await mkdir(candidats, { recursive: true });

/* --depuis : importer un dossier de captures sans avoir a les renommer. */
const option = (nom) => {
  const index = process.argv.indexOf(`--${nom}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
};

const depuis = option("depuis");

if (depuis !== null) {
  const plateforme = option("plateforme") ?? "uber_eats";
  const type = option("type");

  if (!plateformesConnues.includes(plateforme)) {
    console.error(`Plateforme inconnue : ${plateforme}`);
    process.exit(2);
  }
  if (type === null || !typesConnus.includes(type)) {
    console.error(`--type est obligatoire avec --depuis, parmi : ${typesConnus.join(", ")}`);
    process.exit(2);
  }

  const source = depuis.replace(/^~/, process.env.HOME ?? "~");
  const images = (await readdir(source)).filter((nom) => /\.(png|jpe?g|webp)$/i.test(nom)).sort();

  if (images.length === 0) {
    console.error(`Aucune image dans ${source}`);
    process.exit(2);
  }

  let copiees = 0;
  let vides = 0;

  for (const [index, nom] of images.entries()) {
    const origine = path.join(source, nom);

    /* Un dossier de téléchargements contient des fichiers de zéro octet : des
       transferts interrompus, des espaces réservés attendant une synchronisation.
       Les copier ne ferait que reporter l'échec plus loin. */
    if ((await stat(origine)).size === 0) {
      vides += 1;
      continue;
    }

    const extension = nom.slice(nom.lastIndexOf("."));
    const destination = `${plateforme}__${type}__importe-${index + 1}${extension}`;
    await copyFile(origine, path.join(entrees, destination));
    copiees += 1;
  }

  console.log(
    `${copiees} image(s) copiée(s) depuis ${source}` +
      (vides > 0 ? `, ${vides} fichier(s) vide(s) ignoré(s)` : "") +
      "."
  );
  console.log("Les originaux ne sont pas touchés : effacez-les vous-même.\n");
}

const fichiers = (await readdir(entrees)).filter((nom) => /\.(png|jpe?g|webp)$/i.test(nom));

if (fichiers.length === 0) {
  console.log(
    "Aucun spécimen dans calibration/entrees/.\n" +
      "Déposez-en, ou pointez un dossier : npm run calibrer -- --depuis ~/Downloads --type recapitulatif_details"
  );
  process.exit(0);
}

const worker = await createWorker("fra", 1, { cachePath: cache, logger: () => {} });
let traites = 0;
let illisibles = 0;
let sansAncrage = 0;

for (const nom of fichiers) {
  const chemin = path.join(entrees, nom);
  const qui = identite(nom);

  if (qui.erreur) {
    console.error(`  IGNORÉ   ${nom} — ${qui.erreur}`);
    continue;
  }

  /*
   * Une image illisible ne doit jamais arrêter la série : un seul fichier
   * abîmé laisserait tous les suivants sur le disque, ce qui est exactement
   * ce que cet outil promet de ne pas faire. Le spécimen est donc supprimé
   * quoi qu'il arrive.
   */
  try {
    const { width, height } = await sharp(chemin).metadata();

    if (!width || !height) throw new Error("dimensions illisibles");

    const { data } = await worker.recognize(chemin, {}, { tsv: true });

    const mots = lignesEtMots(data.tsv ?? "", width, height);
    const ancrages = reperer(mots, regles);

    console.log(`\n  ${qui.id}  (${width}x${height}, ${mots.length} zones lues)`);

    if (ancrages.length === 0) {
      /* Rien à calibrer : ce n'est probablement pas un récapitulatif. Écrire un
         gabarit vide encombrerait la relecture sans rien apprendre. */
      console.log("    aucun ancrage reconnu — ce n'est pas un récapitulatif");
      sansAncrage += 1;
    } else {
      for (const ancrage of ancrages) {
        const ou = `x ${ancrage.zone.x.toFixed(3)}  y ${ancrage.zone.y.toFixed(3)}`;
        const quoi = ancrage.libelle ?? `forme ${ancrage.motif}`;
        console.log(`    ${quoi.padEnd(30)} ${ou}   confiance ${Math.round(ancrage.confiance)}`);
      }

      await writeFile(
        path.join(candidats, `${qui.id}.json`),
        `${JSON.stringify(
          gabaritCandidat(
            {
              id: qui.id,
              plateforme: qui.plateforme,
              description: `${qui.type} — ${qui.description}`,
            },
            ancrages
          ),
          null,
          2
        )}\n`,
        "utf8"
      );

      traites += 1;
      console.log("    candidat écrit");
    }
  } catch (erreur) {
    /* On nomme le fichier et la cause, jamais son contenu. */
    console.error(`\n  ${qui.id} — illisible : ${erreur instanceof Error ? erreur.message : erreur}`);
    illisibles += 1;
  } finally {
    /* Le spécimen a servi, ou n'a rien pu servir : il disparaît dans les deux cas. */
    await rm(chemin, { force: true });
  }
}

await worker.terminate();

const restants = (await readdir(entrees)).filter((nom) => /\.(png|jpe?g|webp)$/i.test(nom));

console.log(
  `\n${traites} gabarit(s) candidat(s) écrit(s)` +
    (sansAncrage > 0 ? `, ${sansAncrage} image(s) sans ancrage` : "") +
    (illisibles > 0 ? `, ${illisibles} illisible(s)` : "") +
    "."
);

if (restants.length > 0) {
  console.error(
    `${restants.length} spécimen(s) restent dans calibration/entrees/ : ils doivent être traités ou retirés à la main.`
  );
  process.exit(1);
}

console.log("calibration/entrees/ est vide : rien n'a été conservé.");
