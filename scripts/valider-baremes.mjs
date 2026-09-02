#!/usr/bin/env node
/**
 * Validation des baremes dates - Course Reelle
 *
 * Utilisable de deux facons :
 *   - en ligne de commande :
 *       node scripts/valider-baremes.mjs <baremes.json> <baremes.schema.json>
 *   - comme module, pour les tests :
 *       import { validerBaremes } from "./scripts/valider-baremes.mjs"
 *
 * Aucun chemin n'est ecrit en dur : la CLI exige ses deux arguments.
 *
 * Deux passes :
 *   1. Structure - conformite au schema (sous-ensemble JSON Schema reellement utilise).
 *   2. Temps     - ce que JSON Schema ne sait pas exprimer : aucune periode ne peut
 *                  se chevaucher pour une meme cle et une meme plateforme.
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/* ------------------------------------------------------------------ */
/* Passe 1 : structure                                                 */
/* ------------------------------------------------------------------ */

const faireResolveur = (schema) => (noeud) => {
  let courant = noeud;
  while (courant && typeof courant === "object" && courant.$ref) {
    courant = courant.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((acc, cle) => (acc ? acc[cle] : undefined), schema);
  }
  return courant;
};

const typeDe = (valeur) => {
  if (valeur === null) return "null";
  if (Array.isArray(valeur)) return "array";
  if (typeof valeur === "number") return Number.isInteger(valeur) ? "integer" : "number";
  return typeof valeur;
};

const typeAccepte = (attendu, reel) =>
  attendu === reel || (attendu === "number" && reel === "integer");

/**
 * Valide une valeur contre un noeud de schema et empile les messages dans `sortie`.
 * Le collecteur est un parametre pour que les branches d'un `oneOf` puissent etre
 * testees sans polluer le rapport final.
 */
const validerStructure = (valeur, noeud, chemin, sortie, resoudre) => {
  const s = resoudre(noeud);
  if (!s || typeof s !== "object") return;

  if (Array.isArray(s.oneOf)) {
    const auMoinsUneValide = s.oneOf.some((variante) => {
      const essai = [];
      validerStructure(valeur, variante, chemin, essai, resoudre);
      return essai.length === 0;
    });
    if (!auMoinsUneValide) {
      sortie.push(`${chemin} : ${JSON.stringify(valeur)} ne correspond a aucune forme autorisee`);
    }
    return;
  }

  if (s.type !== undefined) {
    const attendus = Array.isArray(s.type) ? s.type : [s.type];
    const reel = typeDe(valeur);
    if (!attendus.some((t) => typeAccepte(t, reel))) {
      sortie.push(`${chemin} : type "${reel}", attendu "${attendus.join(" | ")}"`);
      return;
    }
  }

  if (s.const !== undefined && valeur !== s.const) {
    sortie.push(`${chemin} : doit valoir "${s.const}", trouve "${valeur}"`);
  }
  if (s.enum && !s.enum.includes(valeur)) {
    sortie.push(`${chemin} : "${valeur}" hors liste autorisee (${s.enum.join(", ")})`);
  }
  if (s.pattern && typeof valeur === "string" && !new RegExp(s.pattern).test(valeur)) {
    sortie.push(`${chemin} : "${valeur}" ne respecte pas le format attendu (${s.pattern})`);
  }
  if (s.minLength !== undefined && typeof valeur === "string" && valeur.length < s.minLength) {
    sortie.push(`${chemin} : au moins ${s.minLength} caractere(s) requis`);
  }
  if (s.minimum !== undefined && typeof valeur === "number" && valeur < s.minimum) {
    sortie.push(`${chemin} : ${valeur} est inferieur au minimum ${s.minimum}`);
  }

  if (Array.isArray(valeur)) {
    if (s.minItems !== undefined && valeur.length < s.minItems) {
      sortie.push(`${chemin} : au moins ${s.minItems} element(s) requis`);
    }
    if (s.uniqueItems && new Set(valeur.map((v) => JSON.stringify(v))).size !== valeur.length) {
      sortie.push(`${chemin} : doublon interdit`);
    }
    if (s.items) {
      valeur.forEach((el, i) => validerStructure(el, s.items, `${chemin}[${i}]`, sortie, resoudre));
    }
  }

  if (valeur !== null && typeof valeur === "object" && !Array.isArray(valeur)) {
    for (const cle of s.required ?? []) {
      if (!(cle in valeur)) sortie.push(`${chemin} : champ obligatoire "${cle}" absent`);
    }
    for (const [cle, sousValeur] of Object.entries(valeur)) {
      const sousSchema = s.properties ? s.properties[cle] : undefined;
      if (!sousSchema) {
        if (s.additionalProperties === false) {
          sortie.push(`${chemin} : champ inconnu "${cle}"`);
        }
        continue;
      }
      validerStructure(sousValeur, sousSchema, `${chemin}.${cle}`, sortie, resoudre);
    }
  }
};

/* ------------------------------------------------------------------ */
/* Passe 2 : coherence temporelle                                      */
/* ------------------------------------------------------------------ */

const PORTEE_SYSTEME = "systeme";

const decalerJour = (date, pas) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + pas);
  return d.toISOString().slice(0, 10);
};

const porteesDe = (entree) =>
  Array.isArray(entree.plateformes) ? entree.plateformes : [PORTEE_SYSTEME];

const validerPeriodes = (baremes, familles, erreurs, avertissements) => {
  for (const famille of familles) {
    const entrees = baremes[famille];
    if (!Array.isArray(entrees)) continue;

    const groupes = new Map();

    for (const entree of entrees) {
      if (typeof entree?.cle !== "string" || typeof entree?.valable_du !== "string") continue;

      if (typeof entree.valable_au === "string" && entree.valable_au < entree.valable_du) {
        erreurs.push(
          `${famille}/${entree.cle} : periode inversee (${entree.valable_du} -> ${entree.valable_au})`
        );
      }

      for (const portee of porteesDe(entree)) {
        const identifiant = `${entree.cle}|${portee}`;
        if (!groupes.has(identifiant)) {
          groupes.set(identifiant, { cle: entree.cle, portee, entrees: [] });
        }
        groupes.get(identifiant).entrees.push(entree);
      }
    }

    for (const { cle, portee, entrees: groupe } of groupes.values()) {
      const tries = [...groupe].sort((a, b) => a.valable_du.localeCompare(b.valable_du));

      for (let i = 0; i < tries.length - 1; i += 1) {
        const precedent = tries[i];
        const suivant = tries[i + 1];

        /* Convention : valable_du et valable_au sont inclusifs, null = toujours en vigueur. */
        const chevauchement =
          precedent.valable_au === null || suivant.valable_du <= precedent.valable_au;

        if (chevauchement) {
          erreurs.push(
            `${famille}/${cle} [${portee}] : chevauchement de periodes entre ` +
              `"${precedent.valable_du} -> ${precedent.valable_au ?? "en vigueur"}" et ` +
              `"${suivant.valable_du} -> ${suivant.valable_au ?? "en vigueur"}". ` +
              `Fermer la premiere au ${decalerJour(suivant.valable_du, -1)}.`
          );
        } else if (decalerJour(precedent.valable_au, 1) !== suivant.valable_du) {
          avertissements.push(
            `${famille}/${cle} [${portee}] : trou entre ${precedent.valable_au} et ` +
              `${suivant.valable_du} - une course datee dans cet intervalle ne pourra pas etre classee.`
          );
        }
      }
    }
  }
};

/* ------------------------------------------------------------------ */
/* Point d'entree                                                      */
/* ------------------------------------------------------------------ */

/**
 * @returns {{ erreurs: string[], avertissements: string[], total: number, familles: string[] }}
 */
export const validerBaremes = (baremes, schema) => {
  const erreurs = [];
  const avertissements = [];

  validerStructure(baremes, schema, "baremes", erreurs, faireResolveur(schema));

  /* Les familles ne sont pas ecrites en dur : elles sont lues dans le schema. */
  const familles = Object.entries(schema.properties)
    .filter(([, s]) => s.type === "array")
    .map(([nom]) => nom);

  validerPeriodes(baremes, familles, erreurs, avertissements);

  const total = familles.reduce(
    (somme, famille) => somme + (Array.isArray(baremes[famille]) ? baremes[famille].length : 0),
    0
  );

  return { erreurs, avertissements, total, familles };
};

export const lireJson = async (chemin) => JSON.parse(await readFile(chemin, "utf8"));

const executerCli = async () => {
  const [fichierBaremes, fichierSchema] = process.argv.slice(2);

  if (!fichierBaremes || !fichierSchema) {
    console.error("Usage : node scripts/valider-baremes.mjs <baremes.json> <baremes.schema.json>");
    process.exit(2);
  }

  const [baremes, schema] = await Promise.all([lireJson(fichierBaremes), lireJson(fichierSchema)]);
  const { erreurs, avertissements, total, familles } = validerBaremes(baremes, schema);

  for (const a of avertissements) console.warn(`AVERTISSEMENT  ${a}`);
  for (const e of erreurs) console.error(`ERREUR         ${e}`);

  if (erreurs.length > 0) {
    console.error(`\n${erreurs.length} erreur(s) : baremes invalides.`);
    process.exit(1);
  }

  console.log(
    `Baremes valides : ${total} entree(s) sur ${familles.length} famille(s)` +
      (avertissements.length > 0 ? `, ${avertissements.length} avertissement(s).` : ".")
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await executerCli();
}
