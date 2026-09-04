/**
 * Le brouillon d'une saisie, conservé sur l'appareil.
 *
 * POURQUOI CE MODULE EXISTE. Un livreur a rempli huit champs, l'envoi a échoué,
 * le message lui a suggéré de recharger — et le rechargement a tout effacé.
 * « Personne ne répétera. » Une erreur technique ne peut pas coûter une saisie :
 * le temps du livreur est la ressource que ce site ne s'autorise pas à gaspiller,
 * c'est la règle des quatre-vingt-dix secondes portée à sa conclusion.
 *
 * Le brouillon vit à part du contexte — ville, plateforme, véhicule — qui, lui,
 * survit aux envois exprès. Le brouillon, non : il disparaît à la première
 * soumission réussie, et à ce moment-là seulement. Ni avant l'envoi, ni après un
 * échec, ni au rechargement.
 *
 * CE QU'IL NE CONTIENT PAS : la capture. Un fichier ne se conserve pas d'une
 * page à l'autre, et le contourner reviendrait à recopier une image dans le
 * navigateur — c'est-à-dire à garder plus longtemps ce que le site s'engage à
 * supprimer vite. La re-choisir coûte deux secondes quand tout le reste est là,
 * et l'écran le dit plutôt que de laisser le livreur le découvrir.
 *
 * Module pur pour l'encodage et le décodage ; les accès au stockage sont isolés
 * et n'échouent jamais bruyamment — un navigateur en navigation privée refuse
 * d'écrire, ce qui ne doit pas empêcher de saisir.
 */

export const CLE_BROUILLON = "coursereelle.brouillon";

export interface Brouillon {
  dateCourse: string;
  distance: string;
  prixPaye: string;
  pourboire: string;
  dureeEstimee: string;
  dureeReelle: string;
  autreVille: string;
}

export const BROUILLON_VIDE: Brouillon = {
  dateCourse: "",
  distance: "",
  prixPaye: "",
  pourboire: "",
  dureeEstimee: "",
  dureeReelle: "",
  autreVille: "",
};

const CHAMPS = Object.keys(BROUILLON_VIDE) as (keyof Brouillon)[];

/**
 * Un brouillon relu est toujours complet et toujours fait de chaînes : une clé
 * absente, un nombre, un objet inattendu ne doivent pas casser le formulaire.
 * Ce qui vient du stockage est une donnée, pas une promesse.
 */
export const decoderBrouillon = (brut: string | null): Brouillon => {
  if (brut === null) return BROUILLON_VIDE;

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return BROUILLON_VIDE;
  }

  if (lu === null || typeof lu !== "object") return BROUILLON_VIDE;

  const source = lu as Record<string, unknown>;

  return CHAMPS.reduce<Brouillon>(
    (acc, champ) => ({
      ...acc,
      [champ]: typeof source[champ] === "string" ? source[champ] : "",
    }),
    BROUILLON_VIDE
  );
};

/** Vrai si le brouillon porte quelque chose qui mérite d'être restitué. */
export const brouillonRempli = (brouillon: Brouillon): boolean =>
  CHAMPS.some((champ) => brouillon[champ].trim() !== "");

export const lireBrouillon = (): string | null => {
  try {
    return window.localStorage.getItem(CLE_BROUILLON);
  } catch {
    return null;
  }
};

/** Sur le serveur, il n'y a pas de brouillon : le rendu initial n'en suppose aucun. */
export const brouillonAuRendu = (): string | null => null;

export const ecrireBrouillon = (brouillon: Brouillon) => {
  try {
    window.localStorage.setItem(CLE_BROUILLON, JSON.stringify(brouillon));
  } catch {
    /* Écriture refusée : la saisie continue, elle ne survivra simplement pas. */
  }
};

export const effacerBrouillon = () => {
  try {
    window.localStorage.removeItem(CLE_BROUILLON);
  } catch {
    /* Rien à faire : il n'y avait rien à effacer. */
  }
};
