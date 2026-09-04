/**
 * Tests des rejets qu'un guide peut réparer.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Un guide affiché au mauvais moment coûte sa crédibilité au guide. Montrer
 * « voici le bon écran » après un refus de format ou un doublon apprend au
 * lecteur à ne plus le lire — et il ne le lira pas le jour où c'était vraiment
 * l'écran le problème.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { appelleLeGuide, MOTIFS_GUIDE_CAPTURE } from "../lib/motifs-guide.ts";

test("les rejets d'écran appellent le guide", () => {
  for (const motif of MOTIFS_GUIDE_CAPTURE) {
    assert.equal(appelleLeGuide(motif), true, motif);
  }

  /* Le serveur peut en renvoyer plusieurs d'un coup. */
  assert.equal(appelleLeGuide("doublon_perceptuel,echec_lecture"), true);
});

test("les rejets qui n'ont rien à voir avec l'écran ne l'appellent pas", () => {
  for (const motif of [
    null,
    undefined,
    "",
    "champs",
    "format_refuse",
    "capture_trop_lourde",
    "doublon_exact",
    "vitesse_aberrante",
    "limite_horaire",
  ]) {
    assert.equal(appelleLeGuide(motif), false, `« ${motif} » ne devrait pas appeler le guide`);
  }
});

test("chaque motif du guide existe dans les tables de motifs du site", async () => {
  /* Un motif que le serveur ne renvoie jamais rendrait le guide inatteignable :
     la branche existerait sans jamais s'afficher. */
  const libelles = JSON.parse(await readFile("config/libelles.json", "utf8"));

  const connus = new Set([
    ...Object.keys(libelles.motifs_ocr ?? {}),
    ...Object.keys(libelles.motifs_authenticite ?? {}),
    ...Object.keys(libelles.motifs_capture ?? {}),
  ]);

  for (const motif of MOTIFS_GUIDE_CAPTURE) {
    assert.ok(connus.has(motif), `motif inconnu des tables du site : ${motif}`);
  }
});
