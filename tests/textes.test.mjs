/**
 * Tests des textes publics — FAQ, mentions légales, navigation.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ces pages annoncent au public ce que le site fait : un délai de suppression,
 * une durée de rétention, une adresse d'hébergeur. Le risque n'est pas qu'elles
 * soient laides, c'est qu'elles soient FAUSSES — et une page légale fausse ne se
 * remarque pas, puisque personne ne la relit.
 *
 * D'où deux garanties vérifiées ici plutôt que promises : aucun chiffre n'est
 * écrit dans la prose (les jetons renvoient au barème daté, dans les deux sens),
 * et aucune rubrique obligatoire n'est vide.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { JETONS_TEXTE } from "../lib/cles.ts";
import { jetonsDe, remplacer } from "../lib/textes.ts";

const lire = async (chemin) => JSON.parse(await readFile(chemin, "utf8"));

const libelles = await lire("config/libelles.json");
const mentions = await lire("config/mentions-legales.json");
const baremes = await lire("config/baremes.json");

/** Toutes les chaines d'une structure, quelle que soit sa profondeur. */
const chainesDe = (valeur, recolte = []) => {
  if (typeof valeur === "string") recolte.push(valeur);
  else if (Array.isArray(valeur)) for (const v of valeur) chainesDe(v, recolte);
  else if (valeur && typeof valeur === "object")
    for (const v of Object.values(valeur)) chainesDe(v, recolte);
  return recolte;
};

test("tout jeton employe dans un texte public designe un bareme connu", () => {
  const employes = new Set(
    [...chainesDe(libelles.faq), ...chainesDe(mentions)].flatMap(jetonsDe)
  );

  assert.ok(employes.size > 0, "les textes doivent citer au moins une valeur du systeme");

  for (const jeton of employes) {
    assert.ok(
      Object.hasOwn(JETONS_TEXTE, jeton),
      `jeton sans bareme dans lib/cles.ts : « ${jeton} » — il s'afficherait entre accolades`
    );
  }
});

test("tout bareme nomme dans la table des jetons existe et est en vigueur", () => {
  for (const [jeton, cle] of Object.entries(JETONS_TEXTE)) {
    const entree = baremes.parametres_systeme.find(
      (candidate) => candidate.cle === cle && candidate.valable_au === null
    );

    assert.ok(entree !== undefined, `${jeton} : aucun bareme « ${cle} » en vigueur`);
    assert.equal(typeof entree.valeur, "number", `${jeton} : valeur non numerique`);
  }
});

test("aucun delai n'est ecrit en toutes lettres a cote de son jeton", () => {
  /* Le jeton ne sert a rien si la valeur est aussi recopiee dans la phrase :
     la prose et le code redeviendraient deux verites. */
  const valeurs = Object.values(JETONS_TEXTE).map((cle) => {
    const entree = baremes.parametres_systeme.find(
      (candidate) => candidate.cle === cle && candidate.valable_au === null
    );
    return String(entree.valeur);
  });

  for (const texte of [...chainesDe(libelles.faq), ...chainesDe(mentions.confidentialite)]) {
    if (jetonsDe(texte).length === 0) continue;

    for (const valeur of valeurs) {
      assert.ok(
        !new RegExp(`\\b${valeur}\\b`).test(texte),
        `une valeur de bareme est recopiee a cote de son jeton : « ${texte.slice(0, 60)}… »`
      );
    }
  }
});

test("chaque question de la FAQ est complete et unique", () => {
  const { questions } = libelles.faq;

  assert.ok(questions.length > 0);
  assert.equal(
    new Set(questions.map((entree) => entree.cle)).size,
    questions.length,
    "deux questions partagent une ancre : le sommaire pointerait au mauvais endroit"
  );

  for (const entree of questions) {
    assert.match(entree.cle, /^[a-z_]+$/, `${entree.cle} : ancre non utilisable dans une URL`);
    assert.ok(entree.question.length > 0, `${entree.cle} : question vide`);
    assert.ok(Array.isArray(entree.reponse) && entree.reponse.length > 0,
      `${entree.cle} : reponse vide`);
    assert.ok(entree.reponse.every((p) => typeof p === "string" && p.length > 0),
      `${entree.cle} : paragraphe vide`);

    if (entree.renvoi !== null) {
      assert.match(entree.renvoi.href, /^\//, `${entree.cle} : renvoi hors du site`);
      assert.ok(entree.renvoi.libelle.length > 0, `${entree.cle} : renvoi sans libelle`);
    }
  }
});

test("les rubriques obligatoires des mentions legales sont remplies", () => {
  /*
   * Le regime de l'editeur non professionnel dispense de publier une identite,
   * mais a une condition : que l'hebergeur soit identifie completement. Une
   * rubrique hebergeur incomplete ferait donc tomber la dispense elle-meme.
   */
  assert.ok(mentions.editeur.regime.length > 0);
  assert.ok(mentions.editeur.texte.length > 0);
  assert.match(mentions.editeur.contact, /^[^@\s]+@[^@\s]+\.[a-z]+$/);

  assert.ok(mentions.hebergeur.denomination.length > 0, "hebergeur sans denomination");
  assert.ok(mentions.hebergeur.adresse.length > 0, "hebergeur sans adresse postale");
  assert.ok(mentions.hebergeur.source.url.startsWith("https://"), "adresse sans source");

  assert.ok(mentions.stockage.liste.length > 0);
  for (const prestataire of mentions.stockage.liste) {
    assert.ok(prestataire.denomination.length > 0);
    assert.ok(prestataire.localisation.length > 0, "un prestataire sans localisation");
    assert.ok(prestataire.role.length > 0);
  }

  assert.ok(mentions.confidentialite.points.length > 0);
  assert.ok(mentions.licence.url.startsWith("https://"));
});

test("les liens de navigation pointent tous vers une page du site", () => {
  const liens = [...libelles.navigation.liens, ...libelles.navigation.pied.liens];

  for (const lien of liens) {
    assert.match(lien.href, /^\//, `${lien.libelle} : lien hors du site`);
    assert.ok(lien.libelle.length > 0);
  }
});

test("un jeton inconnu reste visible plutot que de disparaitre", () => {
  /* Une valeur absente ne doit pas laisser une phrase amputee : mieux vaut une
     accolade a l'ecran qu'un delai efface. */
  assert.equal(remplacer("effacé au bout de {inconnu} jours", {}), "effacé au bout de {inconnu} jours");
  assert.equal(remplacer("{a} et {a}", { a: "48" }), "48 et 48");
  assert.deepEqual(jetonsDe("{a} puis {b} puis {a}"), ["a", "b"]);
});

test("tout lien interne annonce dans la configuration mene a une page qui existe", async () => {
  /*
   * Un lien vers une page absente ne casse rien a la construction : il rend un
   * 404 au visiteur, et seulement a lui. C'est le genre de defaut qu'un site
   * decouvre par ses lecteurs, ce qui est la mauvaise facon de l'apprendre.
   */
  const { access } = await import("node:fs/promises");

  const hrefs = new Set(
    [libelles, mentions]
      .flatMap((source) => chainesDe(source))
      .filter((chaine) => /^\/[a-z0-9-]*$/.test(chaine))
  );

  assert.ok(hrefs.size > 0, "la configuration doit declarer des liens internes");

  for (const href of hrefs) {
    const chemin = href === "/" ? "app/page.tsx" : `app${href}/page.tsx`;

    await assert.doesNotReject(
      access(chemin),
      `lien vers une page inexistante : ${href} (attendu ${chemin})`
    );
  }
});

test("l'accueil annonce des actions completes", () => {
  assert.ok(libelles.accueil.actions.length > 0);

  for (const action of libelles.accueil.actions) {
    assert.match(action.href, /^\//);
    assert.ok(action.libelle.length > 0, `${action.href} : action sans libelle`);
    assert.ok(action.description.length > 0, `${action.href} : action sans description`);
  }
});

test("la feuille de base ne porte aucune regle hors couche", async () => {
  /*
   * Une regle CSS sans couche l'emporte sur tout ce que Tailwind ecrit dans
   * « @layer utilities ». Le gabarit de depart en laissait une — body {
   * background: … } — qui remplacait silencieusement le fond de la page. Rien
   * ne le signalait : la classe etait bien presente dans le HTML et bien
   * definie dans la feuille, elle etait simplement perdante. Une classe qui ne
   * s'applique pas ne casse rien, elle ment.
   */
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("app/globals.css", "utf8");

  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Les blocs @layer sont retires en entier, accolades appariees : ce qu'ils
     contiennent EST dans une couche, c'est precisement le but. */
  const retirerBlocs = (texte) => {
    let resultat = "";
    let index = 0;

    while (index < texte.length) {
      const debut = texte.indexOf("@layer", index);
      if (debut === -1) {
        resultat += texte.slice(index);
        break;
      }

      resultat += texte.slice(index, debut);
      const ouverture = texte.indexOf("{", debut);
      if (ouverture === -1) break;

      let profondeur = 1;
      let curseur = ouverture + 1;
      while (curseur < texte.length && profondeur > 0) {
        if (texte[curseur] === "{") profondeur += 1;
        if (texte[curseur] === "}") profondeur -= 1;
        curseur += 1;
      }
      index = curseur;
    }

    return resultat;
  };

  /* Ce qui est autorise : les directives at-rule (@import, @theme, @layer). */
  const regles = [...retirerBlocs(sansCommentaires).matchAll(/(^|\})\s*([^@{}]+)\{/g)].map(
    (t) => t[2].trim()
  );

  assert.deepEqual(
    regles,
    [],
    `regle hors couche dans app/globals.css : ${regles.join(", ")} — elle battrait les utilitaires`
  );
});
