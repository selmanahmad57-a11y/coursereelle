#!/usr/bin/env node
/**
 * Classe les courses validées, et trace ce qui change.
 *
 * Usage : node scripts/avec-env.mjs .env.local node scripts/classer.mjs
 *
 * La classification est écrite au moment du verdict, par le filtre de lecture.
 * Ce script existe pour l'autre moment : celui où un barème change. Un avenant
 * publié, une grille corrigée, et la classification de courses déjà validées
 * peut basculer — le site changerait alors d'avis en silence.
 *
 * Il repasse donc sur toutes les courses validées, recalcule avec la MÊME
 * fonction que le verdict et que l'affichage, et n'écrit une nouvelle génération
 * que là où le résultat diffère. Une exécution qui ne change rien ne laisse
 * aucune trace : l'historique doit contenir des événements, pas des passages.
 *
 * Ne rapporte que des catégories et des comptes.
 */

import { readFile } from "node:fs/promises";

import { classer } from "../lib/classification.ts";
import { enregistrerClassification, generationActuelle } from "../lib/classification-db.ts";
import { reglesClassificationDepuis } from "../lib/classification-regles.ts";
import { db } from "../lib/db.ts";

const baremes = JSON.parse(
  await readFile(new URL("../config/baremes.json", import.meta.url), "utf8")
);

const sql = db();

const lignes = await sql`
  select id, date_course, plateforme, zone, vehicule,
         prix_paye_euros, distance_km, duree_estimee_minutes
  from courses
  where statut = 'validee_auto'
  order by date_course, soumise_le
`;

if (lignes.length === 0) {
  console.log("Aucune course validee a classer.");
  process.exit(0);
}

let ecrites = 0;
let inchangees = 0;

for (const ligne of lignes) {
  const dateCourse =
    ligne.date_course instanceof Date
      ? ligne.date_course.toISOString().slice(0, 10)
      : String(ligne.date_course).slice(0, 10);

  const classements = classer(
    {
      prixEuros: Number(ligne.prix_paye_euros),
      distanceKm: Number(ligne.distance_km),
      dureeEstimeeMinutes:
        ligne.duree_estimee_minutes === null ? null : Number(ligne.duree_estimee_minutes),
    },
    reglesClassificationDepuis(baremes, dateCourse, {
      plateforme: ligne.plateforme,
      zone: ligne.zone,
      vehicule: ligne.vehicule,
    })
  );

  const avant = await generationActuelle(ligne.id);
  const { ecrite, calculeeLe } = await enregistrerClassification(
    ligne.id,
    dateCourse,
    classements
  );

  const resume = classements
    .map(
      (classement) =>
        classement.categorie +
        (classement.valeurBareme === null
          ? ""
          : ` (annonce ${classement.valeurBareme.toFixed(2)}, constate ${classement.valeurConstatee.toFixed(2)})`)
    )
    .join(", ");

  if (ecrite) {
    ecrites += 1;
    const nature = avant.classements.length === 0 ? "premiere classification" : "reclassee";
    console.log(`  ${ligne.id.slice(0, 8)}  ${nature} le ${calculeeLe.slice(0, 19)}`);
    console.log(`      ${resume}`);

    if (avant.classements.length > 0) {
      console.log(`      auparavant : ${avant.classements.map((c) => c.categorie).join(", ")}`);
    }
  } else {
    inchangees += 1;
  }
}

console.log(
  `\n${ecrites} generation(s) ecrite(s), ${inchangees} course(s) inchangee(s) sur ${lignes.length}.`
);
