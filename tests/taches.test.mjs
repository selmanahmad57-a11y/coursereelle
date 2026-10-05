/**
 * Tests des taches periodiques : autorisation, cadence, non-duplication.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ces deux routes suppriment des fichiers et rendent des verdicts. Elles sont
 * publiques par nature — un planificateur doit pouvoir les appeler — donc tout
 * repose sur la porte. Et la cadence n'est pas un detail de confort : c'est elle
 * qui decide si la promesse de suppression sous quarante-huit heures est tenue
 * ou approximative.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";

import { tacheAutorisee } from "../lib/cron.ts";

const SECRET = "un-secret-de-test-suffisamment-long";

test("sans secret configure, la porte reste fermee", () => {
  /*
   * LE REFUS LE PLUS IMPORTANT. Un deploiement ou l'on aurait oublie la
   * variable n'ouvre pas l'entretien au premier venu : l'absence de
   * verification ferme, elle n'autorise pas.
   */
  assert.equal(tacheAutorisee(`Bearer ${SECRET}`, undefined), false);
  assert.equal(tacheAutorisee(`Bearer ${SECRET}`, ""), false);
});

test("un en-tete absent, mal forme ou faux ne passe pas", () => {
  assert.equal(tacheAutorisee(null, SECRET), false);
  assert.equal(tacheAutorisee(SECRET, SECRET), false, "sans le schema Bearer");
  assert.equal(tacheAutorisee(`Basic ${SECRET}`, SECRET), false);
  assert.equal(tacheAutorisee(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(tacheAutorisee(`Bearer ${SECRET.slice(0, -1)}`, SECRET), false);
  assert.equal(tacheAutorisee("Bearer ", SECRET), false);
});

test("le bon secret passe", () => {
  assert.equal(tacheAutorisee(`Bearer ${SECRET}`, SECRET), true);
});

/** Les champs minute et heure d'une expression cron. */
const minuteEtHeure = (expression) => expression.trim().split(/\s+/).slice(0, 2);

const plusieursFoisParJour = (expression) =>
  minuteEtHeure(expression).some((champ) => /[*/,-]/.test(champ));

test("aucun cron declare dans vercel.json ne tourne plus d'une fois par jour", () => {
  /*
   * Contrainte de l'hebergeur, verifiee dans sa documentation : sur le plan
   * gratuit, « Cron expressions that would run more frequently will fail during
   * deployment ». Une expression trop frequente ne casse donc pas la tache :
   * elle casse le DEPLOIEMENT, c'est-a-dire tout le site. Ce test l'attrape
   * avant Vercel.
   */
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));

  assert.ok(vercel.crons.length > 0, "le filet quotidien doit exister");

  for (const cron of vercel.crons) {
    assert.equal(
      plusieursFoisParJour(cron.schedule),
      false,
      `${cron.path} : « ${cron.schedule} » tournerait plus d'une fois par jour`
    );
  }
});

test("chaque cron de vercel.json vise une route qui existe", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));

  for (const cron of vercel.crons) {
    const chemin = `app${cron.path}/route.ts`;
    assert.ok(existsSync(chemin), `cron vers une route inexistante : ${cron.path}`);
  }
});

test("l'entretien passe au moins une fois par heure", async () => {
  /*
   * La cadence decoule de la promesse publiee, et non l'inverse. Le site annonce
   * une suppression quarante-huit heures apres le verdict ; un passage horaire
   * garantit qu'elle a lieu au plus une heure apres le terme. Un passage
   * quotidien la repousserait jusqu'a vingt-cinq heures au-dela, ce qui
   * dementirait le texte affiche.
   */
  const workflow = await readFile(".github/workflows/entretien.yml", "utf8");
  const expressions = [...workflow.matchAll(/-\s*cron:\s*"([^"]+)"/g)].map((t) => t[1]);

  assert.equal(expressions.length, 1, "une seule cadence, pour qu'elle se lise");

  const [minute, heure] = minuteEtHeure(expressions[0]);
  assert.equal(heure, "*", "l'entretien doit passer a toutes les heures");
  assert.match(minute, /^\d+$/, "une minute fixe dans l'heure suffit");
});

test("les routes de tache ne reimplementent rien", async () => {
  /*
   * Meme fonction, nouvelle porte. Une requete SQL ecrite dans une route serait
   * une seconde implementation de l'entretien, qui divergerait de la premiere
   * au premier changement.
   */
  for (const chemin of ["app/api/taches/entretien/route.ts"]) {
    const source = await readFile(chemin, "utf8");

    assert.equal(/\bselect\s/i.test(source), false, `${chemin} : requete SQL en dur`);
    assert.equal(/\bdelete\s+from\b/i.test(source), false, `${chemin} : suppression en dur`);
    assert.match(source, /tacheAutorisee\(/, `${chemin} : porte non gardee`);
  }
});

test("la taille du lot de lecture est un entier positif, avec sa source", async () => {
  const taches = JSON.parse(await readFile("config/taches.json", "utf8"));

  assert.ok(Number.isInteger(taches.lecture.courses_par_passage));
  assert.ok(taches.lecture.courses_par_passage > 0);
  assert.ok(taches.lecture.justification.length > 0, "un lot sans raison est un lot invente");

  /* Une source peut etre une mesure faite ici plutot qu'une page a citer : ce
     qu'on exige, c'est qu'elle soit nommee, pas qu'elle soit un lien. */
  assert.ok(taches.lecture.source.libelle.length > 0, "un lot sans source est un lot invente");
  assert.ok(
    taches.lecture.source.url === null || taches.lecture.source.url.startsWith("https://"),
    "une source qui porte un lien doit porter un vrai lien"
  );
});

test("la lecture est planifiee, et pas plus rarement qu'a l'heure", async () => {
  /*
   * Une course qui attend son verdict attend une lecture. La cadence n'engage
   * aucune promesse publiee, contrairement a celle de l'entretien, mais une
   * lecture trop rare rendrait le report du filtre 2 indistinguable d'un oubli.
   */
  const workflow = await readFile(".github/workflows/lecture.yml", "utf8");
  const expressions = [...workflow.matchAll(/-\s*cron:\s*"([^"]+)"/g)].map((t) => t[1]);

  assert.equal(expressions.length, 1);

  const [minute, heure] = minuteEtHeure(expressions[0]);
  assert.equal(heure, "*", "la lecture doit passer a toutes les heures au moins");
  assert.match(minute, /^\*\/\d+$/, "une cadence infra-horaire, exprimee en pas de minutes");
});

test("le workflow de lecture n'expose que les variables dont il a besoin", async () => {
  /*
   * Ces identifiants ouvrent la base et le stockage. Chaque nom ajoute ici est
   * une surface de plus sur un depot public : la liste doit se relire d'un coup
   * d'oeil, et ne contenir que ce que la lecture emploie vraiment.
   */
  const workflow = await readFile(".github/workflows/lecture.yml", "utf8");
  const employes = new Set(
    [...workflow.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((t) => t[1])
  );

  const attendus = new Set([
    "DATABASE_URL",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_JURIDICTION",
  ]);

  assert.deepEqual([...employes].sort(), [...attendus].sort());
});

test("le moteur de lecture ne demarre qu'apres avoir constate du travail", async () => {
  /*
   * L'INCIDENT DU 29 SEPTEMBRE 2026. Le rondier demarrait le moteur avant de
   * regarder s'il avait quelque chose a lire. L'initialisation telechargeant les
   * donnees de langue, chacun des quatre-vingt-seize passages quotidiens
   * dependait du reseau — et un « fetch failed » de CDN a tue un passage a vide.
   * Sans consequence : rien n'attendait. Mais la surface d'echec etait offerte
   * pour rien, et elle le serait a nouveau un soir de forte soumission.
   */
  const script = await readFile("scripts/lire-captures.mjs", "utf8");

  const constat = script.indexOf("coursesEnAttente(");
  const demarrage = script.indexOf("demarrerLecteur(");

  assert.notEqual(constat, -1, "le script doit compter les courses en attente");
  assert.notEqual(demarrage, -1, "le script doit demarrer le lecteur");
  assert.ok(
    constat < demarrage,
    "compter d'abord, demarrer ensuite : sinon un passage a vide depend du reseau"
  );
});

test("le cache du moteur ne se melange pas aux specimens de tiers", async () => {
  /*
   * Ce cache est remonte dans le cache de l'executeur GitHub. Le dossier de
   * calibration, lui, contient des captures pretees par des collegues, traitees
   * comme des donnees de production. Les deux ne partagent pas un dossier.
   */
  const script = await readFile("scripts/lire-captures.mjs", "utf8");
  const ignore = await readFile(".gitignore", "utf8");
  const flux = await readFile(".github/workflows/lecture.yml", "utf8");

  assert.equal(
    /demarrerLecteur\(path\.join\(racine, "calibration"\)\)/.test(script),
    false,
    "le cache du moteur ne vit pas dans le dossier des specimens"
  );
  assert.match(ignore, /^\/cache-moteur\/$/m, "et il n'est jamais versionne");

  assert.match(flux, /path: cache-moteur/, "c'est ce dossier-la qui est mis en cache");
  assert.match(
    flux,
    /key: .*tesseract-\$\{\{ steps\.moteur\.outputs\.version \}\}/,
    "la cle porte la version du moteur : une montee de version invalide le cache"
  );
});

test("les deux flux tournent sur une image epinglee, avec sa condition de sortie", async () => {
  /*
   * LE 19 OCTOBRE 2026, `ubuntu-latest` bascule sur Ubuntu 26. Le moteur de
   * lecture repose sur des binaires natifs : une image qui change sous nos pieds
   * casserait la lecture sans preavis, et le test ferme a commence. L'epinglage
   * transforme une date subie en decision choisie — ce test empeche qu'un retour
   * a `ubuntu-latest` efface la raison en meme temps que la version.
   */
  for (const flux of ["lecture", "entretien"]) {
    const source = await readFile(`.github/workflows/${flux}.yml`, "utf8");

    assert.match(source, /^    runs-on: ubuntu-\d+\.\d+$/m, `${flux} : image epinglee`);
    assert.equal(
      /runs-on: ubuntu-latest/.test(source),
      false,
      `${flux} : plus aucune image flottante`
    );
    assert.match(source, /QUAND LA RETIRER/, `${flux} : la condition de sortie est ecrite`);
  }
});
