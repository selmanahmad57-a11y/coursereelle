/**
 * Filtre 3 — anti-fraude, sans jamais connaître l'adresse.
 *
 * Le serveur ne conserve aucune adresse IP. Il calcule une empreinte à partir
 * d'un sel tiré chaque jour, et n'écrit que cette empreinte. Passée la fenêtre
 * de rétention, le sel est supprimé et les empreintes deviennent définitivement
 * irréversibles, y compris pour nous.
 *
 * Conséquence directe, et piège central de ce module : l'empreinte d'un même
 * appareil CHANGE à minuit. Une pause déclenchée à 23 h 50 deviendrait
 * inopérante dix minutes plus tard si la vérification n'utilisait que le sel du
 * jour. Toutes les recherches se font donc sur l'ensemble des sels encore
 * retenus — aujourd'hui et hier — et jamais sur le seul sel courant.
 *
 * La même fenêtre de rétention énonce donc deux choses à la fois, et les deux
 * sont vraies : le suivi d'un appareil ne peut jamais excéder cette fenêtre.
 * C'est la garantie d'anonymat, et c'est la limite assumée du filtre.
 *
 * Module pur : tous les seuils arrivent en paramètre, depuis la configuration
 * datée.
 */

const MILLISECONDES_PAR_HEURE = 3_600_000;

export interface SelJournalier {
  jour: string;
  sel: string;
}

export interface SeauHoraire {
  empreinte: string;
  /** Début du seau, tronqué à l'heure, en ISO 8601. */
  heure: string;
  compteur: number;
}

export interface EtatAppareil {
  empreinte: string;
  echecsOcrConsecutifs: number;
  pauseJusqua: string | null;
}

export interface Limites {
  soumissionsMaxParHeure: number | null;
  soumissionsMaxParJour: number | null;
  echecsOcrAvantPause: number | null;
  dureePauseHeures: number | null;
}

/** Exportés au runtime pour que les tests vérifient que chaque motif a un libellé. */
export const MOTIFS_REFUS = [
  "pause_apres_echecs_ocr",
  "limite_horaire",
  "limite_journaliere",
] as const;

export type MotifRefus = (typeof MOTIFS_REFUS)[number];

export interface Decision {
  autorise: boolean;
  motif: MotifRefus | null;
}

/* ------------------------------------------------------------------ */
/* Empreintes                                                          */
/* ------------------------------------------------------------------ */

const enHexadecimal = (donnees: ArrayBuffer): string =>
  Array.from(new Uint8Array(donnees))
    .map((octet) => octet.toString(16).padStart(2, "0"))
    .join("");

export const calculerEmpreinte = async (sel: string, adresse: string): Promise<string> => {
  const donnees = new TextEncoder().encode(`${sel}:${adresse}`);
  return enHexadecimal(await crypto.subtle.digest("SHA-256", donnees));
};

/**
 * Une empreinte par sel encore retenu, la plus récente d'abord. C'est ce qui
 * permet de retrouver un appareil de l'autre côté de minuit : il n'a plus la
 * même empreinte, mais celle d'hier reste calculable tant que le sel d'hier
 * n'est pas supprimé.
 */
export const empreintesCandidates = (
  adresse: string,
  sels: readonly SelJournalier[]
): Promise<string[]> =>
  Promise.all(
    [...sels]
      .sort((a, b) => b.jour.localeCompare(a.jour))
      .map((sel) => calculerEmpreinte(sel.sel, adresse))
  );

/** Le sel du jour, celui sous lequel une nouvelle écriture doit être comptée. */
export const empreinteCourante = (empreintes: readonly string[]): string | null =>
  empreintes[0] ?? null;

/* ------------------------------------------------------------------ */
/* Décision                                                            */
/* ------------------------------------------------------------------ */

/*
 * Un seau couvre une heure pleine. On retient tout seau dont la FIN dépasse le
 * début de la fenêtre : sans cela, à 00 h 10, le seau de 23 h — qui contient les
 * envois de 23 h 50 — serait ignoré parce qu'il commence avant 23 h 10.
 * La fenêtre effective est donc légèrement plus large que demandée, ce qui rend
 * le filtre plus strict et jamais plus laxiste.
 */
const compter = (
  seaux: readonly SeauHoraire[],
  empreintes: readonly string[],
  maintenant: string,
  heures: number
): number => {
  const debutFenetre = Date.parse(maintenant) - heures * MILLISECONDES_PAR_HEURE;
  const retenues = new Set(empreintes);

  return seaux
    .filter(
      (seau) =>
        retenues.has(seau.empreinte) &&
        Date.parse(seau.heure) + MILLISECONDES_PAR_HEURE > debutFenetre
    )
    .reduce((total, seau) => total + seau.compteur, 0);
};

export const evaluerSoumission = ({
  empreintes,
  seaux,
  etats,
  maintenant,
  limites,
}: {
  empreintes: readonly string[];
  seaux: readonly SeauHoraire[];
  etats: readonly EtatAppareil[];
  maintenant: string;
  limites: Limites;
}): Decision => {
  const retenues = new Set(empreintes);
  const instant = Date.parse(maintenant);

  const enPause = etats.some(
    (etat) =>
      retenues.has(etat.empreinte) &&
      etat.pauseJusqua !== null &&
      Date.parse(etat.pauseJusqua) > instant
  );

  if (enPause) return { autorise: false, motif: "pause_apres_echecs_ocr" };

  if (
    limites.soumissionsMaxParHeure !== null &&
    compter(seaux, empreintes, maintenant, 1) >= limites.soumissionsMaxParHeure
  ) {
    return { autorise: false, motif: "limite_horaire" };
  }

  if (
    limites.soumissionsMaxParJour !== null &&
    compter(seaux, empreintes, maintenant, 24) >= limites.soumissionsMaxParJour
  ) {
    return { autorise: false, motif: "limite_journaliere" };
  }

  return { autorise: true, motif: null };
};

/* ------------------------------------------------------------------ */
/* Suivi des échecs OCR                                                */
/* ------------------------------------------------------------------ */

export interface SuiteEchecs {
  echecsOcrConsecutifs: number;
  pauseJusqua: string | null;
}

/**
 * Un échec OCR de plus. Au seuil, l'appareil est mis en pause : soit c'est une
 * tentative automatisée, soit c'est un format de capture que l'OCR ne sait pas
 * lire — dans les deux cas la pause et le passage au tableau de surveillance
 * sont la bonne réponse.
 */
export const apresEchecOcr = (
  etat: SuiteEchecs,
  maintenant: string,
  limites: Limites
): SuiteEchecs => {
  const echecs = etat.echecsOcrConsecutifs + 1;

  const doitPauser =
    limites.echecsOcrAvantPause !== null &&
    limites.dureePauseHeures !== null &&
    echecs >= limites.echecsOcrAvantPause;

  return {
    echecsOcrConsecutifs: echecs,
    pauseJusqua: doitPauser
      ? new Date(
          Date.parse(maintenant) + limites.dureePauseHeures! * MILLISECONDES_PAR_HEURE
        ).toISOString()
      : etat.pauseJusqua,
  };
};

/** Une lecture réussie remet le compteur à zéro et lève la pause. */
export const apresSuccesOcr = (): SuiteEchecs => ({
  echecsOcrConsecutifs: 0,
  pauseJusqua: null,
});
