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
    const essais = s.oneOf.map((variante) => {
      const essai = [];
      validerStructure(valeur, variante, chemin, essai, resoudre);
      return essai;
    });

    if (!essais.some((essai) => essai.length === 0)) {
      /* Sans ce detail, un oneOf transformerait toute erreur en "aucune forme autorisee". */
      const detail = essais
        .flat()
        .map((message) => message.slice(`${chemin} : `.length))
        .join(" ; ");
      sortie.push(
        `${chemin} : ${JSON.stringify(valeur)} ne correspond a aucune forme autorisee - ${detail}`
      );
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

const PORTEE_GLOBALE = "global";

const decalerJour = (date, pas) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + pas);
  return d.toISOString().slice(0, 10);
};

/**
 * Les champs qui decoupent la portee d'une famille sont declares dans le schema
 * (`x-portee`), jamais ecrits en dur ici. Deux vitesses maximales pour deux
 * vehicules differents, ou deux prix au km pour deux zones, portent la meme cle
 * et les memes dates sans pour autant se chevaucher.
 */
const porteesDe = (entree, champs) => {
  let combinaisons = [[]];

  for (const champ of champs) {
    const brut = entree[champ];
    if (brut === undefined || brut === null) continue;
    const valeurs = Array.isArray(brut) ? brut : [brut];
    combinaisons = combinaisons.flatMap((debut) =>
      valeurs.map((valeur) => [...debut, `${champ}=${valeur}`])
    );
  }

  return combinaisons.map((c) => (c.length === 0 ? PORTEE_GLOBALE : c.join(" ")));
};

/* valable_du null = en vigueur depuis une date anterieure inconnue : trie en tete. */
const comparerDebuts = (a, b) => {
  if (a.valable_du === b.valable_du) return 0;
  if (a.valable_du === null) return -1;
  if (b.valable_du === null) return 1;
  return a.valable_du.localeCompare(b.valable_du);
};

const validerPeriodes = (baremes, familles, erreurs, avertissements) => {
  for (const { nom, portee: champsPortee } of familles) {
    const entrees = baremes[nom];
    if (!Array.isArray(entrees)) continue;

    const groupes = new Map();

    for (const entree of entrees) {
      if (typeof entree?.cle !== "string" || !("valable_du" in entree)) continue;

      if (
        typeof entree.valable_du === "string" &&
        typeof entree.valable_au === "string" &&
        entree.valable_au < entree.valable_du
      ) {
        erreurs.push(
          `${nom}/${entree.cle} : periode inversee (${entree.valable_du} -> ${entree.valable_au})`
        );
      }

      for (const portee of porteesDe(entree, champsPortee)) {
        const identifiant = `${entree.cle}|${portee}`;
        if (!groupes.has(identifiant)) {
          groupes.set(identifiant, { cle: entree.cle, portee, entrees: [] });
        }
        groupes.get(identifiant).entrees.push(entree);
      }
    }

    for (const { cle, portee, entrees: groupe } of groupes.values()) {
      const tries = [...groupe].sort(comparerDebuts);

      for (let i = 0; i < tries.length - 1; i += 1) {
        const precedent = tries[i];
        const suivant = tries[i + 1];

        /* Convention : valable_du et valable_au sont inclusifs, null = toujours en vigueur. */
        const chevauchement =
          precedent.valable_au === null ||
          suivant.valable_du === null ||
          suivant.valable_du <= precedent.valable_au;

        const decrire = (e) =>
          `"${e.valable_du ?? "origine"} -> ${e.valable_au ?? "en vigueur"}"`;

        if (chevauchement) {
          erreurs.push(
            `${nom}/${cle} [${portee}] : chevauchement de periodes entre ` +
              `${decrire(precedent)} et ${decrire(suivant)}. ` +
              (suivant.valable_du === null
                ? "Deux valeurs sans date de debut connue ne peuvent pas coexister."
                : `Fermer la premiere au ${decalerJour(suivant.valable_du, -1)}.`)
          );
        } else if (decalerJour(precedent.valable_au, 1) !== suivant.valable_du) {
          avertissements.push(
            `${nom}/${cle} [${portee}] : trou entre ${precedent.valable_au} et ` +
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

  /* Familles et champs de portee sont lus dans le schema, jamais ecrits en dur ici. */
  const familles = Object.entries(schema.properties)
    .filter(([, s]) => s.type === "array")
    .map(([nom, s]) => ({ nom, portee: s["x-portee"] ?? [] }));

  validerPeriodes(baremes, familles, erreurs, avertissements);

  const total = familles.reduce(
    (somme, { nom }) => somme + (Array.isArray(baremes[nom]) ? baremes[nom].length : 0),
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
