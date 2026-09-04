/**
 * Les ordres de lecture du registre des courses.
 *
 * POURQUOI UN TRI, ET PAS UNE PAGE « PIRES COURSES ». Le dossier prévoyait une
 * page dédiée ; elle est abandonnée, et la page Méthode dit pourquoi. Un tri
 * ordonne un ensemble qu'on voit en entier ; une page dédiée fabrique un corpus
 * permanent qui ne montrera jamais le reste, et qui serait cité comme s'il était
 * l'ensemble. Le besoin est le même, le piège ne l'est pas.
 *
 * L'ordre par défaut ne change pas : la date décroissante ne choisit rien. Les
 * autres ordres existent, s'affichent en toutes lettres, et se demandent
 * explicitement.
 *
 * Module pur, et c'est ici que se joue la sécurité : aucune chaîne venue de
 * l'URL ne doit atteindre la base. Un paramètre inconnu retombe sur l'ordre par
 * défaut plutôt que d'être transmis.
 */

export const TRIS = ["date", "taux", "conformite"] as const;

export type Tri = (typeof TRIS)[number];

export const TRI_PAR_DEFAUT: Tri = "date";

const estTri = (valeur: string): valeur is Tri => (TRIS as readonly string[]).includes(valeur);

/** Le tri demandé, ou celui par défaut. Jamais la valeur reçue telle quelle. */
export const triValide = (brut: string | string[] | undefined): Tri => {
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return typeof valeur === "string" && estTri(valeur) ? valeur : TRI_PAR_DEFAUT;
};
