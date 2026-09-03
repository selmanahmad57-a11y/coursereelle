/**
 * Conformité structurelle au gabarit du récapitulatif.
 *
 * Un récapitulatif de plateforme a une mise en page stable : les mêmes libellés,
 * aux mêmes endroits. Une capture reconstituée « de mémoire » par un modèle a de
 * bonnes chances de produire un libellé légèrement faux ou une disposition
 * décalée. Ce contrôle compare donc ce que l'OCR a trouvé, et où, à un gabarit
 * connu.
 *
 * PRUDENCE VOLONTAIRE, et elle est structurelle : tant qu'aucun gabarit n'est
 * connu pour une plateforme, le contrôle ne rejette RIEN. Les gabarits se
 * calibrent en semaine 5 sur de vraies captures variées — versions d'application
 * différentes, Android et iOS, mode clair et mode sombre. Rejeter avant d'avoir
 * vu cette diversité écarterait surtout des livreurs honnêtes.
 *
 * Module pur : gabarits et tolérance arrivent en paramètre.
 */

export interface Zone {
  /** Fractions de la largeur et de la hauteur de l'image, entre 0 et 1. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

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
  zone: Zone;
}

export interface Gabarit {
  id: string;
  plateforme: string;
  /** Ce que ce gabarit couvre : version d'application, système, thème. */
  description: string;
  champs: ChampGabarit[];
}

export interface TexteDetecte {
  texte: string;
  /** Centre du texte, en fractions de la largeur et de la hauteur. */
  x: number;
  y: number;
}

export interface VerdictGabarit {
  /** null quand aucun gabarit n'est connu pour cette plateforme. */
  reconnu: Gabarit | null;
  /** Clés des champs attendus et introuvables, pour le tableau de surveillance. */
  manquants: string[];
  /** Faux uniquement si un gabarit existe et qu'aucun ne correspond. */
  conforme: boolean;
}

const sansAccentsNiCasse = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const dansLaZone = (texte: TexteDetecte, zone: Zone, tolerance: number): boolean =>
  texte.x >= zone.x - tolerance &&
  texte.x <= zone.x + zone.largeur + tolerance &&
  texte.y >= zone.y - tolerance &&
  texte.y <= zone.y + zone.hauteur + tolerance;

const champTrouve = (
  champ: ChampGabarit,
  textes: readonly TexteDetecte[],
  tolerance: number,
  motifs: Readonly<Record<string, string>>
): boolean => {
  const attendus = champ.libelles.map(sansAccentsNiCasse);
  const forme = champ.motif === undefined ? null : motifs[champ.motif];

  return textes.some((texte) => {
    if (!dansLaZone(texte, champ.zone, tolerance)) return false;

    if (attendus.some((attendu) => sansAccentsNiCasse(texte.texte).includes(attendu))) {
      return true;
    }

    /* Ancrage de forme : on vérifie que quelque chose de la bonne allure occupe
       la zone, sans jamais s'intéresser à ce que ce quelque chose vaut. */
    return forme !== null && new RegExp(forme).test(texte.texte.trim());
  });
};

/**
 * Cherche le gabarit qui correspond le mieux. Le meilleur candidat sert à
 * rapporter les champs manquants, pour que le tableau de surveillance montre ce
 * qui a coincé plutôt qu'un simple refus.
 */
export const controlerGabarit = (
  plateforme: string,
  textes: readonly TexteDetecte[],
  gabarits: readonly Gabarit[],
  tolerance: number | null,
  motifs: Readonly<Record<string, string>> = {}
): VerdictGabarit => {
  const candidats = gabarits.filter((gabarit) => gabarit.plateforme === plateforme);

  /* Aucun gabarit connu : on ne rejette pas ce qu'on n'a pas encore appris à reconnaître. */
  if (candidats.length === 0 || tolerance === null) {
    return { reconnu: null, manquants: [], conforme: true };
  }

  let meilleur: { gabarit: Gabarit; manquants: string[] } | null = null;

  for (const gabarit of candidats) {
    const manquants = gabarit.champs
      .filter((champ) => !champTrouve(champ, textes, tolerance, motifs))
      .map((champ) => champ.cle);

    if (manquants.length === 0) {
      return { reconnu: gabarit, manquants: [], conforme: true };
    }

    if (meilleur === null || manquants.length < meilleur.manquants.length) {
      meilleur = { gabarit, manquants };
    }
  }

  return {
    reconnu: null,
    manquants: meilleur === null ? [] : meilleur.manquants,
    conforme: false,
  };
};
