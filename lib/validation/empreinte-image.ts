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
