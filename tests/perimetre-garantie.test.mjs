/**
 * Le périmètre de la garantie horaire.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Ce barème est le plus lourd de conséquences du site : c'est lui qui autorise
 * la phrase « la plateforme garantit 19 €/h et en a payé 14,71 ». L'appliquer à
 * une plateforme qu'il ne couvre pas transformerait une mesure en accusation
 * sans base — et une seule de ces phrases coûterait au site ce qu'il a mis des
 * mois à construire.
 *
 * Son périmètre est donc vérifié, pas relu.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baremes = JSON.parse(await readFile("config/baremes.json", "utf8"));

const enVigueur = (cle) =>
  baremes.regles_annoncees.filter(
    (regle) => regle.cle === cle && regle.valable_au === null
  );

test("la garantie couvre exactement Uber Eats et Deliveroo", () => {
  /*
   * Ni Uber seule — l'avenant du 10 juillet 2026 lie les deux — ni « toutes
   * plateformes », ce qui l'étendrait à des entreprises qui ne l'ont pas signé.
   */
  const entrees = enVigueur("garantie_horaire_brute");

  assert.equal(entrees.length, 1, "une seule garantie en vigueur");
  assert.deepEqual(
    [...entrees[0].plateformes].sort(),
    ["deliveroo", "uber_eats"],
    "le périmètre de la garantie a changé sans que la source suive"
  );
});

test("Stuart n'est comparée à aucune règle annoncée sans source citable", () => {
  /*
   * Stuart a signé l'accord de 2023 au sein de l'API, mais aucune source
   * publique ne confirme sa couverture par l'avenant de 2026. Elle pourra
   * entrer — le jour où une source la nomme, et ce test demande précisément
   * cela : un lien, pas une conviction.
   */
  for (const regle of baremes.regles_annoncees) {
    if (!regle.plateformes.includes("stuart")) continue;

    assert.ok(
      regle.source?.url,
      `« ${regle.cle} » nomme Stuart sans source citable : ` +
        "une règle annoncée qu'aucun lien ne documente ne peut pas servir de comparaison"
    );
  }
});

test("l'incertitude sur Stuart est publiée, pas seulement connue", () => {
  /* La page Méthode affiche cette note : le lecteur voit pourquoi une
     plateforme manque, au lieu de constater un trou sans explication. */
  const [garantie] = enVigueur("garantie_horaire_brute");

  assert.match(garantie.note, /Stuart/);
  assert.match(garantie.note, /ARPE/, "la piste pour lever le doute doit être écrite");
});

test("aucune règle annoncée ne s'applique à toutes les plateformes par défaut", async () => {
  /*
   * Une liste vide se lirait comme « toutes », et un barème sans périmètre
   * finirait par être appliqué à une plateforme qui ne l'a jamais annoncé.
   */
  const schema = JSON.parse(await readFile("config/baremes.schema.json", "utf8"));
  const connues = schema.$defs.plateforme.enum;

  for (const regle of baremes.regles_annoncees) {
    assert.ok(
      Array.isArray(regle.plateformes) && regle.plateformes.length > 0,
      `${regle.cle} : aucune plateforme nommée`
    );

    for (const plateforme of regle.plateformes) {
      assert.ok(connues.includes(plateforme), `${regle.cle} : plateforme inconnue ${plateforme}`);
    }
  }
});
