/**
 * Conformité structurelle au gabarit du récapitulatif.
 *
 * Un récapitulatif de plateforme a une mise en page stable : les mêmes libellés,
 * dans les mêmes colonnes, dans le même ordre. Une capture reconstituée « de
 * mémoire » par un modèle a de bonnes chances de produire un libellé légèrement
 * faux, une colonne déplacée ou un ordre inversé.
 *
 * CE QUI EST ANCRÉ, ET CE QUI NE L'EST PAS. Un livreur capture son écran là où
 * il se trouve ; personne ne remonte en haut de la page avant de photographier.
 * La position verticale absolue d'un libellé dépend donc du défilement, pas de
 * la mise en page. Mesuré sur huit spécimens réels : l'écart entre « Durée » et
 * « Distance », qui sont sur la même ligne, ne dépasse jamais 0,0004 ; leur
 * position verticale absolue, elle, varie de 0,186 — trente-sept fois plus que
 * la tolérance qu'on pourrait raisonnablement accorder.
 *
 * On ancre donc sur les invariants réels :
 *
 *   la COLONNE       — x absolu, d'une stabilité mesurée à un demi-pourcent ;
 *   l'ORDRE          — « Durée » et « Distance » sur une même ligne, « Vos
 *                      revenus » en dessous. Le défilement translate tout le
 *                      bloc, il n'en change jamais l'agencement.
 *
 * HORS-CHAMP, ET CE QUI N'EN EST PAS. Une capture défilée coupe le haut ou le
 * bas de l'écran : un champ absent n'est donc pas une anomalie. Mais absent veut
 * dire ABSENT. Un libellé qui figure bien sur la capture, dans une autre colonne
 * que la sienne, n'est pas hors-champ — c'est une mise en page déplacée, et
 * c'est précisément ce qu'une fabrication naïve produit. Sans cette distinction,
 * il suffirait de permuter deux colonnes pour que les deux champs soient tenus
 * pour absents et que le contrôle laisse tout passer.
 *
 * Les relations entre champs PRÉSENTS doivent être justes ; celles qui portent
 * sur un champ vraiment absent ne sont pas évaluées. Et un gabarit dont AUCUN
 * champ n'est trouvé n'est pas du hors-champ — c'est un autre écran.
 *
 * Module pur : gabarits, tolérances et motifs arrivent en paramètre.
 */

export interface ChampGabarit {
  cle: string;
  /** Variantes acceptées du libellé, comparées sans casse ni accents. */
  libelles: string[];
  /**
   * Ancrage par FORME plutôt que par libellé, pour les zones qu'aucun mot ne
   * nomme — l'écran d'acceptation affiche un montant sans rien à côté. Le nom
   * renvoie à un motif de `config/interface-uber.json` ; ce qui est vérifié est
   * la forme du texte, jamais sa valeur.
   */
  motif?: string;
  /** Colonne attendue, en fraction de la largeur. Le seul invariant de position. */
  x: number;
}

export const TYPES_RELATION = ["meme_ligne", "au_dessus"] as const;

export type TypeRelation = (typeof TYPES_RELATION)[number];

export interface Relation {
  type: TypeRelation;
  champ: string;
  autre: string;
}

export interface Gabarit {
  id: string;
  plateforme: string;
  /** Ce que ce gabarit couvre : version d'application, système, thème. */
  description: string;
  champs: ChampGabarit[];
  relations: Relation[];
}

export interface TexteDetecte {
  texte: string;
  /** Centre du texte, en fractions de la largeur et de la hauteur. */
  x: number;
  y: number;
}

export interface TolerancesGabarit {
  /** Écart horizontal admis entre la colonne attendue et la colonne constatée. */
  x: number;
  /** Écart vertical en deçà duquel deux champs sont tenus pour alignés. */
  ligne: number;
}

export interface VerdictGabarit {
  /** null quand aucun gabarit n'est connu pour cette plateforme, ou qu'aucun ne correspond. */
  reconnu: Gabarit | null;
  /** Champs attendus et vraiment absents : du hors-champ, sauf s'ils le sont tous. */
  manquants: string[];
  /** Champs présents sur la capture, mais dans une autre colonne que la leur. */
  colonnesDeplacees: string[];
  /** Relations entre champs présents qui ne tiennent pas. */
  relationsRompues: string[];
  conforme: boolean;
}

const sansAccentsNiCasse = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const correspond = (
  texte: TexteDetecte,
  champ: ChampGabarit,
  motifs: Readonly<Record<string, string>>
): boolean => {
  const attendus = champ.libelles.map(sansAccentsNiCasse);

  if (attendus.some((attendu) => sansAccentsNiCasse(texte.texte).includes(attendu))) {
    return true;
  }

  const forme = champ.motif === undefined ? undefined : motifs[champ.motif];
  return forme !== undefined && new RegExp(forme).test(texte.texte.trim());
};

/** Le texte correspondant dont la colonne est la plus proche de celle attendue. */
const trouverChamp = (
  champ: ChampGabarit,
  textes: readonly TexteDetecte[],
  tolerances: TolerancesGabarit,
  motifs: Readonly<Record<string, string>>
): TexteDetecte | null => {
  const candidats = textes
    .filter((texte) => Math.abs(texte.x - champ.x) <= tolerances.x)
    .filter((texte) => correspond(texte, champ, motifs));

  if (candidats.length === 0) return null;

  return candidats.reduce((a, b) =>
    Math.abs(b.x - champ.x) < Math.abs(a.x - champ.x) ? b : a
  );
};

const evaluerGabarit = (
  gabarit: Gabarit,
  textes: readonly TexteDetecte[],
  tolerances: TolerancesGabarit,
  motifs: Readonly<Record<string, string>>
): VerdictGabarit => {
  const positions = new Map<string, number>();
  const manquants: string[] = [];
  const colonnesDeplacees: string[] = [];

  for (const champ of gabarit.champs) {
    const trouve = trouverChamp(champ, textes, tolerances, motifs);

    if (trouve !== null) {
      positions.set(champ.cle, trouve.y);
      continue;
    }

    /* Absent de sa colonne : est-il absent de la capture, ou seulement ailleurs ? */
    const ailleurs = textes.some((texte) => correspond(texte, champ, motifs));

    if (ailleurs) colonnesDeplacees.push(champ.cle);
    else manquants.push(champ.cle);
  }

  /* Aucun champ trouvé : ce n'est pas du hors-champ, c'est un autre écran. */
  if (positions.size === 0) {
    return { reconnu: null, manquants, colonnesDeplacees, relationsRompues: [], conforme: false };
  }

  const relationsRompues: string[] = [];

  for (const relation of gabarit.relations) {
    const y = positions.get(relation.champ);
    const autre = positions.get(relation.autre);

    /* Une relation qui porte sur un champ hors-champ n'est pas évaluée. */
    if (y === undefined || autre === undefined) continue;

    const tenue =
      relation.type === "meme_ligne"
        ? Math.abs(y - autre) <= tolerances.ligne
        : y < autre;

    if (!tenue) {
      relationsRompues.push(`${relation.type}:${relation.champ}/${relation.autre}`);
    }
  }

  const conforme = relationsRompues.length === 0 && colonnesDeplacees.length === 0;

  return {
    reconnu: conforme ? gabarit : null,
    manquants,
    colonnesDeplacees,
    relationsRompues,
    conforme,
  };
};

/**
 * Cherche le gabarit qui correspond le mieux. Le meilleur candidat sert à
 * rapporter ce qui a coincé, pour que le tableau de surveillance montre la
 * cause plutôt qu'un simple refus.
 */
export const controlerGabarit = (
  plateforme: string,
  textes: readonly TexteDetecte[],
  gabarits: readonly Gabarit[],
  tolerances: TolerancesGabarit | null,
  motifs: Readonly<Record<string, string>> = {}
): VerdictGabarit => {
  const candidats = gabarits.filter((gabarit) => gabarit.plateforme === plateforme);

  /* Aucun gabarit connu : on ne rejette pas ce qu'on n'a pas encore appris à reconnaître. */
  if (candidats.length === 0 || tolerances === null) {
    return { reconnu: null, manquants: [], colonnesDeplacees: [], relationsRompues: [], conforme: true };
  }

  let meilleur: VerdictGabarit | null = null;

  for (const gabarit of candidats) {
    const verdict = evaluerGabarit(gabarit, textes, tolerances, motifs);

    if (verdict.conforme) return verdict;

    const pire = (v: VerdictGabarit) =>
      v.relationsRompues.length + v.colonnesDeplacees.length + v.manquants.length;
    if (meilleur === null || pire(verdict) < pire(meilleur)) meilleur = verdict;
  }

  return meilleur as VerdictGabarit;
};
