/**
 * Les règles de calibration, lues une fois pour tous les outils qui en dépendent.
 *
 * Deux scripts les consomment : la calibration des spécimens et la conversion
 * des anciens candidats. Les recopier reviendrait à donner deux sources à une
 * même vérité, et à laisser l'une dériver de l'autre sans que rien ne le dise.
 *
 * Rien n'est écrit ici : tout vient de config/. Un barème manquant lève une
 * erreur au lieu de céder la place à une valeur de repli — un seuil de repli est
 * un seuil inventé, et il s'appliquerait sans que personne l'ait décidé.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CHAMPS_VERIFIES } from "../lib/validation/ocr.ts";

export const racine = new URL("../", import.meta.url).pathname;

const lireJson = async (nom) =>
  JSON.parse(await readFile(path.join(racine, "config", nom), "utf8"));

/** La valeur en vigueur d'un paramètre système, ou une erreur franche. */
const enVigueur = (baremes, cle) => {
  const entree = baremes.parametres_systeme.find(
    (candidate) => candidate.cle === cle && candidate.valable_au === null
  );

  if (entree === undefined) {
    throw new Error(`Barème absent ou périmé dans config/baremes.json : ${cle}`);
  }

  return entree.valeur;
};

export const chargerRegles = async () => {
  const [interfaceUber, schema, captures, baremes] = await Promise.all([
    lireJson("interface-uber.json"),
    lireJson("baremes.schema.json"),
    lireJson("captures.json"),
    lireJson("baremes.json"),
  ]);

  /* La note explicative vit à côté des motifs dans la configuration : on la
     retire avant de traiter le reste comme des expressions. */
  const motifs = Object.fromEntries(
    Object.entries(interfaceUber.motifs).filter(([nom]) => nom !== "note")
  );

  return {
    interfaceUber,
    plateformesConnues: schema.$defs.plateforme.enum,
    typesConnus: captures.types.liste.map((type) => type.cle),

    regles: {
      libellesAttendus: interfaceUber.libelles_attendus,
      motifs,
      confianceMinimale: interfaceUber.confiance_minimale,
    },

    /* Quel motif de forme lit quel champ, et ce que chaque écran prouve. On ne
       retient que les vraies clés de champ : la table porte aussi une note et le
       nom du champ indispensable. */
    reglesType: {
      motifsParChamp: Object.fromEntries(
        CHAMPS_VERIFIES.filter(
          (champ) => typeof interfaceUber.champs_verifiables[champ] === "string"
        ).map((champ) => [champ, interfaceUber.champs_verifiables[champ]])
      ),
      champsProuves: Object.fromEntries(
        captures.types.liste.map((type) => [type.cle, type.champs_prouves])
      ),
    },

    reglesPromotion: {
      ancragesMinimum: enVigueur(baremes, "ancrages_minimum_gabarit"),
      champsProbants: captures.politique_verification.probants,
    },

    /* Un pourcentage dans la configuration, une fraction dans le modèle. */
    toleranceLigne: enVigueur(baremes, "tolerance_meme_ligne") / 100,
  };
};
