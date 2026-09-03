/**
 * Empreinte perceptuelle d'une capture (dHash).
 *
 * Le hachage exact déjà en place refuse deux fois le même fichier. Il ne voit
 * rien si la même capture est resoumise recadrée, réenregistrée ou éclaircie —
 * or c'est exactement le geste d'une campagne de soumissions fabriquées. Une
 * empreinte perceptuelle survit à ces retouches : deux images visuellement
 * proches produisent des empreintes proches, et la distance de Hamming mesure
 * cet écart.
 *
 * Principe du dHash : on compare chaque pixel à son voisin de droite. Ce qui est
 * encodé n'est donc pas la luminosité mais le SENS des variations, ce qui rend
 * l'empreinte insensible à un changement global de luminosité ou de contraste.
 *
 * Module pur : il reçoit une matrice de luminances déjà réduite et convertie en
 * niveaux de gris par l'appelant, et n'ouvre aucun fichier. Le seuil de
 * similarité arrive en paramètre, depuis la configuration datée.
 */

/**
 * @param luminances Matrice de niveaux de gris. Chaque ligne doit compter une
 *   colonne de plus que le nombre de bits voulu par ligne : huit lignes de neuf
 *   valeurs donnent une empreinte de 64 bits.
 */
export const empreinteImage = (luminances: readonly (readonly number[])[]): string => {
  if (luminances.length === 0) return "";

  const largeur = luminances[0].length;

  if (largeur < 2) {
    throw new Error("Une empreinte perceptuelle exige au moins deux colonnes par ligne.");
  }
  if (luminances.some((ligne) => ligne.length !== largeur)) {
    throw new Error("Toutes les lignes doivent avoir la même largeur.");
  }

  const bits: number[] = [];

  for (const ligne of luminances) {
    for (let colonne = 0; colonne < largeur - 1; colonne += 1) {
      bits.push(ligne[colonne] < ligne[colonne + 1] ? 1 : 0);
    }
  }

  /* Complété à un multiple de quatre pour une écriture hexadécimale exacte. */
  while (bits.length % 4 !== 0) bits.push(0);

  let empreinte = "";
  for (let debut = 0; debut < bits.length; debut += 4) {
    const quartet = bits[debut] * 8 + bits[debut + 1] * 4 + bits[debut + 2] * 2 + bits[debut + 3];
    empreinte += quartet.toString(16);
  }

  return empreinte;
};

/**
 * Combien de comparaisons portent une information.
 *
 * Le dHash compare chaque pixel a son voisin. Quand les deux sont egaux, la
 * comparaison est tranchee arbitrairement et n'apprend rien. Une image sans
 * relief a l'echelle reduite — un aplat, une capture presque uniforme — produit
 * donc une empreinte de zeros, identique a celle de n'importe quelle autre image
 * sans relief. Deux captures parfaitement differentes se ressembleraient alors
 * parfaitement.
 *
 * Cette mesure permet de savoir quand l'empreinte ne conclut rien.
 */
export const reliefEmpreinte = (luminances: readonly (readonly number[])[]): number => {
  let strictes = 0;

  for (const ligne of luminances) {
    for (let colonne = 0; colonne < ligne.length - 1; colonne += 1) {
      if (ligne[colonne] !== ligne[colonne + 1]) strictes += 1;
    }
  }

  return strictes;
};

const BITS_PAR_QUARTET = 4;

const compterBits = (valeur: number): number => {
  let reste = valeur;
  let total = 0;
  while (reste > 0) {
    total += reste & 1;
    reste >>= 1;
  }
  return total;
};

/**
 * Nombre de bits qui diffèrent. `null` si les deux empreintes ne sont pas
 * comparables — mieux vaut ne rien conclure que conclure de travers.
 */
export const distanceHamming = (a: string, b: string): number | null => {
  if (a.length === 0 || a.length !== b.length) return null;

  let distance = 0;

  for (let index = 0; index < a.length; index += 1) {
    const gauche = Number.parseInt(a[index], 16);
    const droite = Number.parseInt(b[index], 16);

    if (Number.isNaN(gauche) || Number.isNaN(droite)) return null;

    distance += compterBits(gauche ^ droite);
  }

  return distance;
};

export const longueurEnBits = (empreinte: string): number =>
  empreinte.length * BITS_PAR_QUARTET;

export interface Similaire {
  empreinte: string;
  distance: number;
}

/**
 * Les empreintes déjà connues qui sont trop proches de celle proposée. Une liste
 * non vide signale une capture déjà soumise, éventuellement retouchée.
 */
export const trouverSimilaires = (
  empreinte: string,
  connues: readonly string[],
  distanceMaximale: number | null
): Similaire[] => {
  if (distanceMaximale === null) return [];

  return connues
    .map((connue) => ({ empreinte: connue, distance: distanceHamming(empreinte, connue) }))
    .filter(
      (candidate): candidate is Similaire =>
        candidate.distance !== null && candidate.distance <= distanceMaximale
    )
    .sort((a, b) => a.distance - b.distance);
};

export interface Similarites {
  /** Assez proches pour être tenues pour la même capture : rejet. */
  identiques: Similaire[];
  /** Ressemblantes sans certitude : journalisées, sans effet sur la soumission. */
  aSurveiller: Similaire[];
}

/**
 * Deux bandes plutôt qu'un seuil unique, parce que toutes nos images sont des
 * captures du même gabarit d'interface : deux courses différentes se ressemblent
 * déjà beaucoup, et un seuil de rejet trop large écarterait des courses
 * légitimes en série.
 */
export const classerSimilarites = (
  empreinte: string,
  connues: readonly string[],
  seuils: { rejet: number | null; surveillance: number | null }
): Similarites => {
  const large = trouverSimilaires(empreinte, connues, seuils.surveillance ?? seuils.rejet);

  if (seuils.rejet === null) return { identiques: [], aSurveiller: large };

  return {
    identiques: large.filter((candidate) => candidate.distance <= (seuils.rejet as number)),
    aSurveiller: large.filter((candidate) => candidate.distance > (seuils.rejet as number)),
  };
};
