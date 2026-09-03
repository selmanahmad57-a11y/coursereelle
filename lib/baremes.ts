/**
 * Accès typé aux barèmes datés.
 *
 * Rien n'est écrit en dur ici : les valeurs viennent de `config/baremes.json`,
 * les libellés d'affichage et les symboles d'unités de `config/libelles.json`.
 * Les deux fichiers sont tenus alignés sur le schéma par les tests
 * (`tests/baremes.test.mjs` et `tests/libelles.test.mjs`).
 */

import donnees from "@/config/baremes.json";
import libelles from "@/config/libelles.json";

export interface Source {
  libelle: string;
  url: string | null;
  consultee_le: string | null;
}

interface Datee {
  cle: string;
  libelle: string;
  valeur: number;
  unite: string;
  usage: string;
  valable_du: string | null;
  valable_au: string | null;
  precision_date?: string;
  note?: string;
}

export interface RegleAnnoncee extends Datee {
  plateformes: string[];
  zone?: string;
  groupe?: string;
  source: Source;
}

export interface RegleLegale extends Datee {
  definition: string;
  source: Source;
}

export interface ParametreSysteme extends Datee {
  vehicule?: string;
  justification: string;
}

export interface Baremes {
  version_schema: number;
  regles_annoncees: RegleAnnoncee[];
  regles_legales: RegleLegale[];
  parametres_systeme: ParametreSysteme[];
}

export const baremes: Baremes = donnees;

/* ------------------------------------------------------------------ */
/* Mise en forme                                                       */
/* ------------------------------------------------------------------ */

const traduire = <T extends "plateformes" | "vehicules" | "zones" | "usages">(
  famille: T,
  cle: string
): string => {
  const table = libelles[famille] as Record<string, string>;
  return table[cle] ?? cle;
};

/** Le symbole et le nombre de décimales d'une unité vivent dans la config, pas ici. */
export const formaterValeur = (valeur: number, unite: string): string => {
  const definition = (
    libelles.unites as Record<
      string,
      { symbole: string; decimales_min: number; decimales_max: number }
    >
  )[unite];

  if (!definition) return `${valeur} ${unite}`;

  const nombre = new Intl.NumberFormat(libelles.locale, {
    minimumFractionDigits: definition.decimales_min,
    maximumFractionDigits: definition.decimales_max,
  }).format(valeur);

  return `${nombre} ${definition.symbole}`;
};

const formaterDate = (date: string): string => {
  const jour = new Date(`${date}T00:00:00Z`);
  const texte = new Intl.DateTimeFormat(libelles.locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(jour);

  /* Intl rend « 1 septembre » ; l'usage francais veut « 1er septembre ». */
  return jour.getUTCDate() === 1 ? texte.replace(/^1\s/, "1er ") : texte;
};

/**
 * Convention du projet : les deux bornes sont inclusives, `null` en fin de
 * période signifie « toujours en vigueur », `null` en début signifie « en
 * vigueur depuis une date antérieure inconnue ».
 */
export const formaterPeriode = (du: string | null, au: string | null): string => {
  if (du === null && au === null) return "En vigueur, depuis une date inconnue";
  if (du === null) return `Jusqu'au ${formaterDate(au as string)}, depuis une date inconnue`;
  if (au === null) return `Depuis le ${formaterDate(du)}`;
  return `Du ${formaterDate(du)} au ${formaterDate(au)}`;
};

export type EtatSource = keyof typeof libelles.etats_source;

export const etatSource = (source: Source): EtatSource => {
  if (source.url === null) return "absente";
  return source.consultee_le === null ? "citee" : "verifiee";
};

export const libelleEtatSource = (etat: EtatSource): string => libelles.etats_source[etat];

/** Sur quoi porte une entrée : plateformes et zone, ou véhicule, ou rien. */
export const decrirePortee = (
  entree: RegleAnnoncee | RegleLegale | ParametreSysteme
): string | null => {
  if ("plateformes" in entree) {
    const noms = entree.plateformes.map((p) => traduire("plateformes", p)).join(", ");
    return entree.zone ? `${noms} — ${traduire("zones", entree.zone)}` : noms;
  }

  if ("justification" in entree) {
    return entree.vehicule
      ? traduire("vehicules", entree.vehicule)
      : libelles.portees.tous_vehicules;
  }

  return null;
};

export const libelleUsage = (usage: string): string => traduire("usages", usage);

export const familles = libelles.familles;

/** Regroupe les entrées d'une même grille tarifaire, en préservant l'ordre du fichier. */
export const grouperParGrille = (regles: RegleAnnoncee[]): Map<string, RegleAnnoncee[]> => {
  const groupes = new Map<string, RegleAnnoncee[]>();

  for (const regle of regles) {
    const cle = regle.groupe ?? regle.cle;
    if (!groupes.has(cle)) groupes.set(cle, []);
    (groupes.get(cle) as RegleAnnoncee[]).push(regle);
  }

  return groupes;
};
