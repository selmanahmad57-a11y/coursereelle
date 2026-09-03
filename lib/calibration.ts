/**
 * Calibration d'un gabarit à partir d'un spécimen.
 *
 * Un spécimen fourni par un collègue livreur est une capture de production : il
 * contient l'adresse d'un restaurant, celle d'un client, un horaire. La personne
 * qui l'a prêtée n'a rien choisi de publier. La calibration doit donc offrir les
 * mêmes garanties que le pipeline : lire, extraire ce qui sert, et ne rien
 * laisser sortir d'autre.
 *
 * LA GARANTIE, ET SA FORME EXACTE : ce module n'écrit jamais le texte qu'il a
 * lu. Quand un libellé de la liste blanche est reconnu, c'est l'entrée de la
 * LISTE qui ressort, pas la lecture. Autrement dit, même si la reconnaissance
 * rend « Durée du trajet — 18 rue des Lilas », la sortie ne contient que
 * « Durée ». Une zone que rien ne nomme n'est décrite que par la forme attendue
 * et sa position.
 *
 * Cette forme-là n'est pas une précaution, c'est une impossibilité : aucune
 * chaîne issue de l'image ne traverse ce module.
 *
 * Module pur : la liste blanche et les motifs arrivent en paramètre.
 */

import type { ChampGabarit, Relation } from "./validation/gabarit.ts";

/** Boîte d'un mot lu, en fractions de l'image. */
export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface MotDetecte {
  /** Le texte lu. Il entre ici, et il n'en ressort jamais. */
  texte: string;
  /** Boîte du mot, en fractions de la largeur et de la hauteur de l'image. */
  zone: Zone;
  confiance: number;
}

export interface ReglesCalibration {
  libellesAttendus: readonly string[];
  motifs: Readonly<Record<string, string>>;
  confianceMinimale: number;
}

export interface Ancrage {
  /** Clé du champ dans le gabarit : le libellé normalisé, ou le nom du motif. */
  cle: string;
  /** Renseigné pour un ancrage par libellé ; absent pour un ancrage de forme. */
  libelle?: string;
  /** Renseigné pour un ancrage de forme ; absent pour un ancrage par libellé. */
  motif?: string;
  zone: Zone;
  confiance: number;
}

const sansAccentsNiCasse = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Une clé stable, dérivée du libellé de la liste — jamais de la lecture. */
const cleDepuis = (libelle: string): string =>
  sansAccentsNiCasse(libelle).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const centre = (zone: Zone) => ({ x: zone.x + zone.largeur / 2, y: zone.y + zone.hauteur / 2 });

const memeZone = (a: Zone, b: Zone, tolerance: number): boolean => {
  const ca = centre(a);
  const cb = centre(b);
  return Math.abs(ca.x - cb.x) <= tolerance && Math.abs(ca.y - cb.y) <= tolerance;
};

/**
 * Repère les ancrages utilisables. Rien de ce qui est renvoyé ne provient de
 * l'image : les libellés viennent de la liste blanche, les noms de motifs de la
 * configuration, et seules les positions sont mesurées.
 */
export const reperer = (
  mots: readonly MotDetecte[],
  regles: ReglesCalibration
): Ancrage[] => {
  const ancrages: Ancrage[] = [];
  const lisibles = mots.filter((mot) => mot.confiance >= regles.confianceMinimale);

  for (const attendu of regles.libellesAttendus) {
    const cible = sansAccentsNiCasse(attendu);

    for (const mot of lisibles) {
      if (!sansAccentsNiCasse(mot.texte).includes(cible)) continue;

      ancrages.push({
        cle: cleDepuis(attendu),
        libelle: attendu,
        zone: mot.zone,
        confiance: mot.confiance,
      });
      break;
    }
  }

  for (const [nom, source] of Object.entries(regles.motifs)) {
    let forme: RegExp;
    try {
      forme = new RegExp(source);
    } catch {
      continue;
    }

    for (const mot of lisibles) {
      if (!forme.test(mot.texte.trim())) continue;

      /* Un motif qui tombe sur la même zone qu'un libellé déjà retenu
         n'apporterait rien : le libellé est un ancrage plus sûr. */
      if (ancrages.some((ancrage) => memeZone(ancrage.zone, mot.zone, 0.01))) continue;

      ancrages.push({ cle: nom, motif: nom, zone: mot.zone, confiance: mot.confiance });
      break;
    }
  }

  return ancrages;
};

const centreX = (zone: Zone) => zone.x + zone.largeur / 2;
const centreY = (zone: Zone) => zone.y + zone.hauteur / 2;

export const enChamps = (ancrages: readonly Ancrage[]): ChampGabarit[] =>
  ancrages.map((ancrage) => ({
    cle: ancrage.cle,
    libelles: ancrage.libelle === undefined ? [] : [ancrage.libelle],
    ...(ancrage.motif === undefined ? {} : { motif: ancrage.motif }),
    x: centreX(ancrage.zone),
  }));

/**
 * Les relations verticales observées, et elles seules.
 *
 * On ne consigne pas la position de chaque champ — elle dépend du défilement —
 * mais leur agencement : qui est aligné avec qui, et qui est au-dessus de qui.
 * Le défilement translate le bloc entier sans jamais en changer l'ordre.
 */
export const enRelations = (
  ancrages: readonly Ancrage[],
  toleranceLigne: number
): Relation[] => {
  const tries = [...ancrages].sort((a, b) => centreY(a.zone) - centreY(b.zone));

  const lignes: Ancrage[][] = [];
  for (const ancrage of tries) {
    const derniere = lignes[lignes.length - 1];
    const meme =
      derniere !== undefined &&
      Math.abs(centreY(ancrage.zone) - centreY(derniere[0].zone)) <= toleranceLigne;

    if (meme) derniere.push(ancrage);
    else lignes.push([ancrage]);
  }

  const relations: Relation[] = [];

  for (const ligne of lignes) {
    for (const autre of ligne.slice(1)) {
      relations.push({ type: "meme_ligne", champ: ligne[0].cle, autre: autre.cle });
    }
  }

  for (let index = 0; index < lignes.length - 1; index += 1) {
    relations.push({
      type: "au_dessus",
      champ: lignes[index][0].cle,
      autre: lignes[index + 1][0].cle,
    });
  }

  return relations;
};

/**
 * Ce qu'un écran doit porter pour prouver un champ, et ce qu'il prouve.
 *
 * Les deux tables viennent de la configuration : `champs_verifiables` dit quel
 * motif de forme lit quel champ, `champs_prouves` dit quels champs chaque écran
 * démontre.
 */
export interface ReglesType {
  motifsParChamp: Readonly<Record<string, string>>;
  champsProuves: Readonly<Record<string, readonly string[]>>;
}

export interface VerdictType {
  /** null quand aucun type ne convient, ou que plusieurs conviennent également. */
  type: string | null;
  possibles: string[];
  /** Les champs que la capture porte réellement, tels que les motifs les voient. */
  champsAncres: string[];
}

/**
 * Le type de capture se DÉDUIT de ce que l'écran porte, il ne se déclare pas.
 *
 * `config/captures.json` le dit déjà pour le pipeline : « le gabarit reconnu
 * détermine quels champs l'OCR peut vérifier ». Déclarer le type à la main pour
 * un lot entier serait donc à la fois inutile et faux dès que le lot est mêlé.
 *
 * Un écran d'acceptation prouve un prix et une distance ; un récapitulatif y
 * ajoute une durée. Un type est possible quand tout ce qu'il prétend prouver est
 * effectivement ancré ; entre deux types possibles, le plus exigeant l'emporte,
 * parce que ce qu'il prouve en plus a bien été vu.
 *
 * SA LIMITE, ÉNONCÉE. Un récapitulatif défilé au-delà de sa durée ne porte plus
 * que prix et distance : il sera classé comme écran d'acceptation. C'est pour
 * cela que le candidat consigne aussi les champs ancrés — l'erreur reste
 * visible, et se corrige sans avoir à redemander la capture.
 */
export const deduireType = (
  ancrages: readonly Ancrage[],
  regles: ReglesType
): VerdictType => {
  const formes = new Set(
    ancrages.map((ancrage) => ancrage.motif).filter((motif) => motif !== undefined)
  );

  const champsAncres = Object.entries(regles.motifsParChamp)
    .filter(([, motif]) => formes.has(motif))
    .map(([champ]) => champ);

  const possibles = Object.entries(regles.champsProuves)
    .filter(([, champs]) => champs.every((champ) => champsAncres.includes(champ)))
    .map(([type]) => type);

  if (possibles.length === 0) return { type: null, possibles, champsAncres };

  const exigence = (type: string) => regles.champsProuves[type].length;
  const plafond = Math.max(...possibles.map(exigence));
  const specifiques = possibles.filter((type) => exigence(type) === plafond);

  return {
    type: specifiques.length === 1 ? specifiques[0] : null,
    possibles,
    champsAncres,
  };
};

export interface GabaritCandidat {
  id: string;
  plateforme: string;
  description: string;
  /** Déduit des ancrages, null quand la capture ne tranche pas. */
  typeCapture: string | null;
  /** Ce qui a fondé la déduction, pour qu'un classement douteux se relise. */
  champsAncres: string[];
  champs: ChampGabarit[];
  relations: Relation[];
}

export const gabaritCandidat = (
  identite: { id: string; plateforme: string; description: string },
  ancrages: readonly Ancrage[],
  toleranceLigne: number,
  reglesType: ReglesType
): GabaritCandidat => {
  const verdict = deduireType(ancrages, reglesType);

  return {
    ...identite,
    typeCapture: verdict.type,
    champsAncres: verdict.champsAncres,
    champs: enChamps(ancrages),
    relations: enRelations(ancrages, toleranceLigne),
  };
};
