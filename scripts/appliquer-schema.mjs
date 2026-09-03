#!/usr/bin/env node
/**
 * Applique sql/schema.sql à la base.
 *
 * Usage : node scripts/avec-env.mjs .env.local node scripts/appliquer-schema.mjs
 *
 * Le fichier est idempotent et rejouable : chaque table est créée « if not
 * exists » et chaque migration est écrite pour pouvoir être passée deux fois.
 * L'appliquer à la main dans une console web était le maillon faible de cette
 * promesse — une migration ajoutée au dépôt mais oubliée en base fait diverger
 * le code et les données sans que rien ne le dise.
 *
 * Ne rapporte que des comptes et, en cas d'échec, la première ligne de
 * l'instruction fautive : jamais de données.
 */

import { readFile } from "node:fs/promises";

import { db } from "../lib/db.ts";
import { decouperSql } from "../lib/decouper-sql.ts";

const source = await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8");
const instructions = decouperSql(source);

console.log(`${instructions.length} instruction(s) a appliquer.\n`);

const sql = db();
let appliquees = 0;

for (const [index, instruction] of instructions.entries()) {
  const premiereLigne = instruction
    .split("\n")
    .find((ligne) => ligne.trim() !== "" && !ligne.trim().startsWith("--"))
    ?.trim()
    .slice(0, 70);

  try {
    await sql.query(instruction);
    appliquees += 1;
  } catch (erreur) {
    console.error(`\nEchec a l'instruction ${index + 1} : ${premiereLigne}`);
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(1);
  }
}

console.log(`${appliquees} instruction(s) appliquee(s) sans erreur.`);
