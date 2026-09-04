/**
 * Le parcours en série : plusieurs envois sans rechargement.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * C'est LE parcours du livreur qui saisit sa soirée — trois, cinq, huit courses
 * l'une après l'autre. Il a échoué en production dès la deuxième : le widget
 * anti-robot n'était rendu qu'une fois, au chargement de la page, et le
 * formulaire remonté après un succès n'en obtenait jamais.
 *
 * Ces tests ne rejouent pas le parcours — cela demande un navigateur — mais ils
 * interdisent la cause : le rendu automatique, qui ne peut par nature servir
 * qu'une fois.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const composants = [];
for (const entree of await readdir("components")) {
  if (entree.endsWith(".tsx")) {
    composants.push({
      chemin: path.join("components", entree),
      source: await readFile(path.join("components", entree), "utf8"),
    });
  }
}

test("aucun formulaire ne s'en remet au rendu automatique du widget", () => {
  /*
   * `class="cf-turnstile"` demande au script de Cloudflare d'habiller l'élément
   * lors de son unique passage, au chargement. Un formulaire remonté ensuite
   * reste vide, et le livreur voit « la vérification ne s'est pas exécutée »
   * sans rien avoir fait de mal.
   */
  const fautifs = composants
    .filter(({ chemin, source }) => chemin !== "components/Turnstile.tsx" && source.includes("cf-turnstile"))
    .filter(({ source }) => /className=["'][^"']*cf-turnstile/.test(source))
    .map(({ chemin }) => chemin);

  assert.deepEqual(
    fautifs,
    [],
    `rendu automatique du widget — il ne fonctionnera qu'une fois : ${fautifs.join(", ")}`
  );
});

test("le widget se rend explicitement, et se retire au démontage", () => {
  const source = composants.find((c) => c.chemin === "components/Turnstile.tsx")?.source;

  assert.ok(source !== undefined, "le composant du widget doit exister");
  assert.match(source, /turnstile\.render\(/, "rendu explicite attendu");
  assert.match(source, /turnstile\?\.remove\(/, "retrait au démontage attendu");
  assert.match(source, /render=explicit/, "le script doit être chargé en mode explicite");
});

test("les deux formulaires remontent le widget à chaque essai", () => {
  /* Une clé qui change force le remontage : c'est ce qui produit un jeton neuf
     après un succès comme après un échec, avec un seul mécanisme. */
  for (const nom of ["FormulaireCourse", "FormulaireSession"]) {
    const source = composants.find((c) => c.chemin === `components/${nom}.tsx`)?.source;

    assert.ok(source !== undefined, `${nom} doit exister`);
    assert.match(source, /<Turnstile\b/, `${nom} : le composant du widget n'est pas employé`);
    assert.match(source, /key=\{essaiTurnstile\}/, `${nom} : le widget n'est pas remonté`);
    assert.match(source, /renouvelerJeton\(\)/, `${nom} : aucun renouvellement après échec`);
  }
});

test("le brouillon ne s'efface qu'à la soumission réussie", () => {
  /*
   * Ni à l'envoi, ni après un échec, ni au rechargement. Un brouillon effacé
   * trop tôt est exactement le défaut qu'il vient corriger.
   */
  const source = composants.find((c) => c.chemin === "components/FormulaireCourse.tsx").source;

  const effacements = [...source.matchAll(/effacerBrouillon\(\)/g)].length;
  assert.ok(effacements >= 1, "le brouillon doit s'effacer quelque part");

  /* L'effacement du succès précède immédiatement l'entrée dans l'écran de succès. */
  assert.match(
    source,
    /effacerBrouillon\(\);\s*\n\s*setEnvoyee\(true\)/,
    "l'effacement doit accompagner le succès, pas l'envoi"
  );

  const avantEnvoi = source.slice(0, source.indexOf("await fetch("));
  assert.equal(
    avantEnvoi.includes("effacerBrouillon()"),
    false,
    "le brouillon est effacé avant même que l'envoi ait abouti"
  );
});

test("chaque champ de course est conservé dans le brouillon", async () => {
  /* Un champ oublié dans le brouillon, c'est un champ que le livreur retapera —
     et il ne retapera pas. */
  const { BROUILLON_VIDE } = await import("../lib/brouillon.ts");
  const source = composants.find((c) => c.chemin === "components/FormulaireCourse.tsx").source;

  for (const champ of Object.keys(BROUILLON_VIDE)) {
    assert.match(
      source,
      new RegExp(`majBrouillon\\("${champ}"`),
      `champ non conservé : ${champ}`
    );
  }
});
