/**
 * Statistiques robustes à la contamination.
 *
 * C'est ici que se joue la vraie défense du site contre les fausses captures.
 * Aucun contrôle d'image ne peut prouver qu'une capture est authentique ; en
 * revanche, on peut faire en sorte qu'une soumission frauduleuse ne change rien
 * à ce qui est publié.
 *
 * D'où le choix de la MÉDIANE plutôt que de la moyenne pour tout chiffre public.
 * Sur cinq cents courses, vingt soumissions fabriquées, même extravagantes,
 * déplacent la médiane de façon négligeable ; elles déplacent la moyenne
 * franchement. Le test `tests/statistiques.test.mjs` le démontre chiffres en
 * main, et la page Méthode l'annonce publiquement.
 *
 * Module pur : les seuils arrivent en paramètre, depuis la configuration datée.
 */

const estUtilisable = (valeur: number): boolean => Number.isFinite(valeur);

const trier = (valeurs: readonly number[]): number[] =>
  valeurs.filter(estUtilisable).sort((a, b) => a - b);

export const moyenne = (valeurs: readonly number[]): number | null => {
  const utilisables = valeurs.filter(estUtilisable);
  if (utilisables.length === 0) return null;
  return utilisables.reduce((total, valeur) => total + valeur, 0) / utilisables.length;
};

/** Interpolation linéaire entre les deux valeurs encadrantes. */
export const quantile = (valeurs: readonly number[], part: number): number | null => {
  const triees = trier(valeurs);
  if (triees.length === 0) return null;
  if (triees.length === 1) return triees[0];

  const position = (triees.length - 1) * part;
  const bas = Math.floor(position);
  const haut = Math.ceil(position);

  if (bas === haut) return triees[bas];
  return triees[bas] + (triees[haut] - triees[bas]) * (position - bas);
};

export const mediane = (valeurs: readonly number[]): number | null => quantile(valeurs, 0.5);

export const ecartType = (valeurs: readonly number[]): number | null => {
  const utilisables = valeurs.filter(estUtilisable);
  if (utilisables.length < 2) return null;

  const centre = moyenne(utilisables) as number;
  const variance =
    utilisables.reduce((total, valeur) => total + (valeur - centre) ** 2, 0) /
    utilisables.length;

  return Math.sqrt(variance);
};

export interface Partition {
  retenues: number[];
  exclues: number[];
}

/**
 * Filtre 4 : au-delà de `ecartsTypes` écarts-types de la moyenne, une valeur est
 * classée hors distribution et sort des statistiques publiques — sans que la
 * course, elle, soit jamais rejetée.
 */
export const exclureAberrantes = (
  valeurs: readonly number[],
  ecartsTypes: number | null
): Partition => {
  const utilisables = valeurs.filter(estUtilisable);
  const dispersion = ecartType(utilisables);

  if (ecartsTypes === null || dispersion === null || dispersion === 0) {
    return { retenues: utilisables, exclues: [] };
  }

  const centre = moyenne(utilisables) as number;
  const limite = ecartsTypes * dispersion;

  return {
    retenues: utilisables.filter((valeur) => Math.abs(valeur - centre) <= limite),
    exclues: utilisables.filter((valeur) => Math.abs(valeur - centre) > limite),
  };
};

export interface Resume {
  effectif: number;
  effectifExclu: number;
  mediane: number | null;
  premierQuartile: number | null;
  troisiemeQuartile: number | null;
  /** Publié à titre de comparaison uniquement : jamais le chiffre mis en avant. */
  moyenne: number | null;
  /** Faux tant que l'effectif n'atteint pas le seuil de publication. */
  publiable: boolean;
}

export const resumer = (
  valeurs: readonly number[],
  {
    ecartsTypes,
    effectifMinimal,
  }: { ecartsTypes: number | null; effectifMinimal: number | null }
): Resume => {
  const { retenues, exclues } = exclureAberrantes(valeurs, ecartsTypes);

  return {
    effectif: retenues.length,
    effectifExclu: exclues.length,
    mediane: mediane(retenues),
    premierQuartile: quantile(retenues, 0.25),
    troisiemeQuartile: quantile(retenues, 0.75),
    moyenne: moyenne(retenues),
    publiable: effectifMinimal === null ? false : retenues.length >= effectifMinimal,
  };
};
