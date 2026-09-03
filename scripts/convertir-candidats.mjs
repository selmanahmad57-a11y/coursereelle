#!/usr/bin/env node
/**
 * Conversion des candidats écrits avant l'ancrage relatif.
 *
 * Usage : npm run convertir:candidats
 *
 * Les premiers candidats décrivaient des ZONES ABSOLUES : x, y, largeur,
 * hauteur. Le modèle a changé — il n'ancre plus que la colonne et l'ordre — et
 * ces fichiers sont devenus illisibles pour lui.
 *
 * POURQUOI CONVERTIR PLUTÔT QUE JETER. Les y qu'ils portent sont des mesures
 * réelles, faites sur des spécimens détruits après lecture et donc
 * irreproductibles. Les jeter détruirait de la donnée de calibration qu'on ne
 * peut pas racheter. Or la conversion est mécanique et sans perte pour ce que le
 * nouveau modèle consomme : les x deviennent des colonnes, et les y, qui ne
 * servent plus en absolu, servent encore à établir l'ordre vertical — qui est
 * aligné avec qui, qui est au-dessus de qui.
 *
 * Ce qui est perdu l'est de toute façon : la hauteur absolue, dont on a mesuré
 * qu'elle ne voulait rien dire d'un spécimen à l'autre.
 *
 * Les convertis portent `convertiDepuisZonesAbsolues: true`. Ils rejoignent le
 * corpus au même titre que les autres, mais on saura toujours qu'ils viennent
 * d'un modèle antérieur et que leur spécimen n'existe plus.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { gabaritCandidat, promouvable } from "../lib/calibration.ts";
import { chargerRegles, racine } from "./regles-calibration.mjs";

const { typesConnus, reglesType, reglesPromotion, toleranceLigne } = await chargerRegles();

const dossier = path.join(racine, "calibration", "candidats");

/* L'ancien identifiant vaut « plateforme-type-description ». Le type y avait été
   déclaré à la main, au moment de l'import. */
const decomposer = (id, plateforme) => {
  let reste = id.startsWith(`${plateforme}-`) ? id.slice(plateforme.length + 1) : id;

  for (const type of typesConnus) {
    if (reste.startsWith(`${type}-`)) {
      return { typeDeclare: type, slug: reste.slice(type.length + 1) };
    }
  }

  return { typeDeclare: null, slug: reste };
};

const fichiers = (await readdir(dossier)).filter((nom) => nom.endsWith(".json")).sort();

let convertis = 0;
let deja = 0;
let auBanc = 0;

for (const nom of fichiers) {
  const chemin = path.join(dossier, nom);
  const ancien = JSON.parse(await readFile(chemin, "utf8"));

  if (Array.isArray(ancien.relations)) {
    deja += 1;
    continue;
  }

  /* Les champs de l'ancien modèle sont déjà des ancrages : ils portent la zone
     mesurée. La confiance n'y figurait pas, et n'entre dans aucun des calculs
     que la conversion refait. */
  const ancrages = ancien.champs.map((champ) => ({
    cle: champ.cle,
    ...(champ.libelles?.length > 0 ? { libelle: champ.libelles[0] } : {}),
    ...(champ.motif === undefined ? {} : { motif: champ.motif }),
    zone: champ.zone,
    confiance: null,
  }));

  const { typeDeclare, slug } = decomposer(ancien.id, ancien.plateforme);

  /*
   * ON NE REDÉDUIT PAS LE TYPE D'UN CONVERTI, et c'est le point délicat.
   *
   * Ses ancrages ont été relevés sous des motifs qui ont changé depuis : celui
   * de la durée était alors ancré aux extrémités du texte et ne reconnaissait
   * rien sur une ligne partagée, « 16 min 34 s 11.18 km ». Une déduction sur ces
   * ancrages-là conclut « écran d'acceptation » pour des récapitulatifs qui
   * affichent « Vos revenus » et « Prix total du trajet » — et elle le conclut
   * avec l'aplomb d'une mesure, alors qu'elle ne mesure qu'une absence causée
   * par une règle périmée.
   *
   * Une déduction n'est donc recevable que sur des ancrages relevés sous les
   * règles en vigueur. Le type déclaré à l'époque, lui, était une information
   * humaine : on le conserve pour ce qu'il est, sans le faire passer pour une
   * déduction.
   */
  const candidat = {
    ...gabaritCandidat(
      { id: ancien.id, plateforme: ancien.plateforme, description: slug.replace(/-/g, " ") },
      ancrages,
      toleranceLigne,
      reglesType
    ),
    typeCapture: null,
    ...(typeDeclare === null ? {} : { typeDeclareALorigine: typeDeclare }),
    convertiDepuisZonesAbsolues: true,
  };

  await writeFile(chemin, `${JSON.stringify(candidat, null, 2)}\n`, "utf8");

  const verdictPromotion = promouvable(candidat, reglesPromotion);
  if (!verdictPromotion.promouvable) auBanc += 1;

  convertis += 1;
  console.log(
    `  ${nom.padEnd(48)} ${ancrages.length} ancrage(s), ` +
      `type déclaré à l'origine : ${typeDeclare ?? "aucun"}, ` +
      (verdictPromotion.promouvable
        ? "promouvable"
        : `au banc : ${verdictPromotion.motifs.join(", ")}`)
  );
}

console.log(
  `\n${convertis} candidat(s) converti(s)` +
    (auBanc > 0 ? `, ${auBanc} au banc` : "") +
    (deja > 0 ? `, ${deja} déjà au nouveau modèle` : "") +
    "."
);
