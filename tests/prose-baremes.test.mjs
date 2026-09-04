/**
 * La prose ne double jamais un barème.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * « Quarante-huit heures après le verdict », écrit en toutes lettres dans la
 * page Méthode à côté du barème qui portait 48 : la phrase serait devenue fausse
 * au premier changement de délai, silencieusement, sans qu'aucun test ne s'en
 * aperçoive. Trouvée par hasard en écrivant un autre test — et il y en avait une
 * seconde, « quatre-vingt-dix secondes », deux paragraphes plus loin.
 *
 * LA RÈGLE VÉRIFIÉE ICI : dès qu'une valeur est racontée au public, elle reçoit
 * un jeton dans `JETONS_TEXTE` — et sa forme épelée devient interdite dans les
 * textes. Le test suit donc la liste des jetons : il grandit tout seul, sans
 * qu'on ait à penser à lui.
 *
 * Il ne prétend pas attraper toute prose numérique. Un texte qui dirait « une
 * journée » là où un barème vaut 24 heures lui échapperait ; le tamis serait
 * alors plein de faux positifs — « deux natures », « trois filtres » — et un
 * test qu'on apprend à ignorer ne protège plus rien.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { JETONS_TEXTE } from "../lib/cles.ts";

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept",
  "dix-huit", "dix-neuf",
];
const DIZAINES = { 20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante", 80: "quatre-vingt" };

/** Les formes usuelles d'un entier en toutes lettres. */
const enLettres = (nombre) => {
  if (nombre < 20) return [UNITES[nombre]];
  if (nombre === 70) return ["soixante-dix"];
  if (nombre === 90) return ["quatre-vingt-dix"];
  if (nombre === 100) return ["cent"];
  if (DIZAINES[nombre]) return [DIZAINES[nombre]];

  const dizaine = Math.floor(nombre / 10) * 10;
  const unite = nombre % 10;

  if (DIZAINES[dizaine] && unite > 0) {
    return [`${DIZAINES[dizaine]}${unite === 1 ? "-et-un" : `-${UNITES[unite]}`}`];
  }

  /* Au-delà, on ne prétend pas savoir écrire le nombre : mieux vaut ne rien
     vérifier que vérifier une forme fausse. */
  return [];
};

const baremes = JSON.parse(await readFile("config/baremes.json", "utf8"));

const textes = [];
for (const nom of ["config/libelles.json", "config/mentions-legales.json"]) {
  textes.push({ nom, source: await readFile(nom, "utf8") });
}

const valeurEnVigueur = (cle) => {
  for (const famille of ["regles_annoncees", "regles_legales", "parametres_systeme"]) {
    const entree = (baremes[famille] ?? []).find(
      (candidate) => candidate.cle === cle && candidate.valable_au === null
    );
    if (entree !== undefined) return entree.valeur;
  }
  return null;
};

test("aucune valeur racontée au public n'est épelée en toutes lettres", () => {
  const fautes = [];

  for (const [jeton, cle] of Object.entries(JETONS_TEXTE)) {
    const valeur = valeurEnVigueur(cle);
    assert.ok(valeur !== null, `barème introuvable pour le jeton ${jeton} : ${cle}`);

    /*
     * En dessous de dix, le nombre écrit est un mot ordinaire : « entre deux
     * courses » n'a rien à voir avec les deux jours de rétention des empreintes,
     * et c'est exactement ce que le tamis a signalé au premier essai. Un test qui
     * crie sur des phrases justes s'apprend à ignorer, et cesse alors de protéger
     * le jour où il a raison. Il ne surveille donc que les valeurs à deux
     * chiffres et au-delà — celles qu'on épelle rarement par hasard.
     */
    if (!Number.isInteger(valeur) || valeur < 10) continue;

    for (const forme of enLettres(valeur)) {
      for (const { nom, source } of textes) {
        /* La forme doit être suivie d'une grandeur : « quatre-vingt-dix » seul
           peut appartenir à une phrase qui ne parle pas du barème. */
        const motif = new RegExp(
          `${forme}[^,.;:!?]{0,20}(heure|jour|seconde|minute|course|euro|kilom|pour ?cent|bit|octet)`,
          "i"
        );

        if (motif.test(source)) {
          fautes.push(`${nom} : « ${forme} » double le barème ${cle} = ${valeur} (jeton {${jeton}})`);
        }
      }
    }
  }

  assert.deepEqual(fautes, [], `prose qui double un barème :\n  ${fautes.join("\n  ")}`);
});

test("chaque jeton désigne un barème réellement en vigueur", () => {
  /* L'inverse : un jeton qui pointe vers un barème périmé laisserait une accolade
     à l'écran, ce que personne ne relit. */
  for (const [jeton, cle] of Object.entries(JETONS_TEXTE)) {
    assert.ok(valeurEnVigueur(cle) !== null, `${jeton} → ${cle} : aucun barème en vigueur`);
  }
});
