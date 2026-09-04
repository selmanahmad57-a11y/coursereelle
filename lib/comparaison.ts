/**
 * Les proportions d'une comparaison, pour que l'écart se voie.
 *
 * Le site publie un écart entre ce qu'une plateforme annonce et ce qu'elle
 * paie. Écrit, il se lit ; dessiné, il se constate. Mais un dessin qui ne
 * découle pas exactement des nombres serait pire qu'une phrase : il donnerait
 * une impression sans en répondre.
 *
 * D'où ce module, et sa règle unique : la longueur d'une barre est la valeur
 * divisée par la plus grande des valeurs comparées, et rien d'autre. Aucun
 * minimum visuel, aucune échelle tronquée, aucune exagération de l'écart — les
 * trois façons ordinaires de faire mentir un graphique. Une barre deux fois
 * plus longue vaut exactement le double.
 *
 * Module pur : les valeurs arrivent en paramètre, les pourcentages en sortent.
 */

export interface ValeurComparee {
  cle: string;
  valeur: number | null;
}

export interface Proportion {
  cle: string;
  valeur: number;
  /** Part de la plus grande valeur, en pourcentage. */
  part: number;
  /** Vrai pour la valeur de référence, celle qui occupe toute la longueur. */
  reference: boolean;
}

const utilisable = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur) && valeur > 0;

export const proportions = (valeurs: readonly ValeurComparee[]): Proportion[] => {
  const retenues = valeurs.filter((entree) => utilisable(entree.valeur));

  if (retenues.length === 0) return [];

  const plafond = Math.max(...retenues.map((entree) => entree.valeur as number));

  return retenues.map((entree) => ({
    cle: entree.cle,
    valeur: entree.valeur as number,
    part: ((entree.valeur as number) / plafond) * 100,
    reference: entree.valeur === plafond,
  }));
};

/**
 * La part manquante d'une valeur pour atteindre la référence.
 *
 * C'est elle que le dessin colore : le manque à gagner n'est pas une absence de
 * barre, c'est un segment qui a sa propre longueur et sa propre couleur. Un
 * écart qu'on ne voit qu'en comparant deux longueurs demande un effort ; un
 * écart matérialisé se constate.
 */
export const manque = (proportion: Proportion): number =>
  Math.max(0, 100 - proportion.part);

/**
 * La valeur mesurée est-elle EN DEÇÀ de ce qui était annoncé ?
 *
 * C'est cette question, et elle seule, qui autorise la couleur d'alerte. Sans
 * elle, le dessin colorerait en rouge toute différence — y compris une course
 * mieux payée que la garantie, où le manque est du côté de l'annonce. Une
 * alerte qui se déclenche sur un bon cas apprend au lecteur à l'ignorer.
 *
 * L'égalité ne déclenche rien : une course payée exactement au barème annoncé
 * est conforme, et n'a pas à porter une marque d'écart.
 */
export const enDeca = (valeur: number | null, reference: number | null): boolean =>
  utilisable(valeur) && utilisable(reference) && valeur < reference;
