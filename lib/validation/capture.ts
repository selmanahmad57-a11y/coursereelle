/**
 * Contrôle du fichier de capture, avant tout envoi.
 *
 * Ce module ne regarde que le contenant : type et taille. Ce qui est écrit SUR
 * la capture relève du filtre 2 (lecture automatique), et le montant qui y
 * figure ne peut jamais motiver un refus.
 *
 * Le même contrôle tourne côté navigateur, pour prévenir tout de suite, et côté
 * serveur, qui seul fait foi : un contrôle client se contourne.
 *
 * Module pur : formats acceptés et tailles limites arrivent en paramètre.
 */

export const MOTIFS_CAPTURE = [
  "aucun_fichier",
  "format_non_pris_en_charge",
  "fichier_trop_volumineux",
  "fichier_trop_leger",
] as const;

export type MotifCapture = (typeof MOTIFS_CAPTURE)[number];

export interface FichierPropose {
  /** Type MIME annoncé par le navigateur. Peut être vide sur certains appareils. */
  type: string;
  /** Nom du fichier, utilisé en secours quand le type MIME manque. */
  nom: string;
  taille: number;
}

export interface FormatAccepte {
  type_mime: string;
  extensions: string[];
}

export interface ContraintesCapture {
  formatsAcceptes: readonly FormatAccepte[];
  tailleMinimaleOctets: number | null;
  tailleMaximaleOctets: number | null;
}

export interface RefusCapture {
  motif: MotifCapture;
  /** Renseigné pour les refus de taille, pour pouvoir l'afficher. */
  taille?: number;
  limite?: number;
}

const extensionDe = (nom: string): string => {
  const point = nom.lastIndexOf(".");
  return point === -1 ? "" : nom.slice(point).toLowerCase();
};

/**
 * Le type MIME est vérifié en premier ; l'extension ne sert qu'en secours,
 * certains navigateurs mobiles n'annonçant aucun type.
 */
export const formatAccepte = (
  fichier: FichierPropose,
  formats: readonly FormatAccepte[]
): boolean => {
  const type = fichier.type.toLowerCase();

  if (type !== "") return formats.some((format) => format.type_mime === type);

  const extension = extensionDe(fichier.nom);
  return formats.some((format) => format.extensions.includes(extension));
};

/** `null` signifie que le fichier passe le contrôle. */
export const controlerCapture = (
  fichier: FichierPropose | null,
  contraintes: ContraintesCapture
): RefusCapture | null => {
  if (fichier === null) return { motif: "aucun_fichier" };

  if (!formatAccepte(fichier, contraintes.formatsAcceptes)) {
    return { motif: "format_non_pris_en_charge" };
  }

  if (contraintes.tailleMaximaleOctets !== null && fichier.taille > contraintes.tailleMaximaleOctets) {
    return {
      motif: "fichier_trop_volumineux",
      taille: fichier.taille,
      limite: contraintes.tailleMaximaleOctets,
    };
  }

  if (contraintes.tailleMinimaleOctets !== null && fichier.taille < contraintes.tailleMinimaleOctets) {
    return {
      motif: "fichier_trop_leger",
      taille: fichier.taille,
      limite: contraintes.tailleMinimaleOctets,
    };
  }

  return null;
};

/**
 * Un format explicitement refusé, pour pouvoir expliquer POURQUOI plutôt que de
 * répondre « format non pris en charge » à quelqu'un qui a photographié son
 * écran de bonne foi.
 */
export const formatRefuseReconnu = <T extends FormatAccepte>(
  fichier: FichierPropose,
  formatsRefuses: readonly T[]
): T | null => formatsRefuses.find((format) => formatAccepte(fichier, [format])) ?? null;
