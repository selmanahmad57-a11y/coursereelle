#!/usr/bin/env node
/**
 * Pose les variables d'environnement sur le deploiement, et cree le secret des
 * taches planifiees.
 *
 * Usage : node scripts/avec-env.mjs .env.local node scripts/poser-variables.mjs [environnement]
 *
 * AUCUNE VALEUR N'EST AFFICHEE, ni ecrite ailleurs que la ou elle doit aller.
 * Le script ne rapporte que des noms et des verdicts : c'est la meme discipline
 * que pour les captures, appliquee aux cles.
 *
 * Les valeurs sont lues dans process.env, apres chargement par le meme mecanisme
 * que celui de l'application : une valeur protegee par un « \$ » dans le fichier
 * arrive donc ici telle que le code la verra, et non telle qu'elle est ecrite.
 * Recopier le fichier ligne a ligne aurait pousse la version echappee.
 *
 * CRON_SECRET n'existe nulle part avant ce script : il est engendre ici, ecrit
 * dans .env.local pour que vous le gardiez, pose sur le deploiement, et confie
 * au depot pour ses taches planifiees. Il ne passe par aucun affichage.
 */

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";

const environnement = process.argv[2] ?? "production";

/** Ecrit une valeur sur l'entree standard d'une commande, sans jamais l'afficher. */
const transmettre = (commande, arguments_, valeur) =>
  new Promise((resoudre) => {
    const processus = spawn(commande, arguments_, { stdio: ["pipe", "ignore", "pipe"] });

    let erreur = "";
    processus.stderr.on("data", (morceau) => {
      erreur += morceau.toString();
    });

    processus.on("close", (code) => resoudre({ code, erreur }));

    processus.stdin.write(valeur);
    processus.stdin.end();
  });

const nomsDuFichier = (contenu) =>
  contenu
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#") && ligne.includes("="))
    .map((ligne) => ligne.slice(0, ligne.indexOf("=")).trim())
    .filter((nom) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(nom));

const fichier = await readFile(".env.local", "utf8");
const noms = nomsDuFichier(fichier);

/* Le secret des taches : engendre s'il n'existe pas encore. */
if (!noms.includes("CRON_SECRET")) {
  const secret = randomBytes(32).toString("hex");
  await appendFile(
    ".env.local",
    `\n# Secret des taches planifiees, engendre le ${new Date().toISOString().slice(0, 10)}.\nCRON_SECRET=${secret}\n`,
    "utf8"
  );
  process.env.CRON_SECRET = secret;
  noms.push("CRON_SECRET");
  console.log("CRON_SECRET engendre et ecrit dans .env.local (valeur jamais affichee).\n");
}

console.log(`Environnement vise : ${environnement}\n`);

let posees = 0;
let echecs = 0;

for (const nom of noms) {
  const valeur = process.env[nom];

  if (typeof valeur !== "string" || valeur === "") {
    console.log(`  ${nom.padEnd(32)} IGNOREE (vide)`);
    continue;
  }

  /* --force remplace une valeur deja posee : le script doit pouvoir etre rejoue. */
  const { code, erreur } = await transmettre(
    "vercel",
    ["env", "add", nom, environnement, "--force"],
    valeur
  );

  if (code === 0) {
    posees += 1;
    console.log(`  ${nom.padEnd(32)} posee`);
  } else {
    echecs += 1;
    /* On ne rapporte que la premiere ligne de l'erreur : le reste pourrait
       contenir la valeur soumise. */
    console.log(`  ${nom.padEnd(32)} ECHEC : ${erreur.split("\n")[0]?.slice(0, 80)}`);
  }
}

/* Le depot a besoin du meme secret pour declencher les taches. */
const { code } = await transmettre(
  "gh",
  ["secret", "set", "CRON_SECRET"],
  process.env.CRON_SECRET ?? ""
);

console.log(
  `\n${posees} variable(s) posee(s)` +
    (echecs > 0 ? `, ${echecs} en echec` : "") +
    `. Secret du depot : ${code === 0 ? "pose" : "ECHEC"}.`
);
