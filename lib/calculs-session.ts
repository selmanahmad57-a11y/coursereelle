/**
 * Calculs de session — la donnée que l'accord ignore.
 *
 * La garantie horaire est calculée sur le seul temps « en course » estimé par la
 * plateforme. Ce module calcule l'autre chiffre : ce que rapporte une heure
 * CONNECTÉE, attente comprise. L'écart entre les deux est la raison d'être du
 * site.
 *
 * Comme pour les courses, le revenu considéré est celui versé par la
 * plateforme, hors pourboires : c'est le seul comparable à un barème annoncé.
 *
 * Module pur : aucun seuil n'y est écrit, tout arrive en paramètre.
 */

const MINUTES_PAR_HEURE = 60;
const MINUTES_PAR_JOUR = 24 * MINUTES_PAR_HEURE;

export interface Session {
  /** Horodatages complets, en ISO 8601. */
  connexionLe: string | null;
  deconnexionLe: string | null;
  nombreCourses: number | null;
  /** Versé par la plateforme, hors pourboires. */
  revenuPlateformeEuros: number | null;
  /** Temps « en course » déclaré, quand l'application le donne. Facultatif. */
  minutesEnCourse: number | null;
}

export interface ResultatSession {
  dureeConnecteeMinutes: number | null;
  /** Revenu plateforme ramené à l'heure CONNECTÉE, attente comprise. */
  tauxHoraireConnecte: number | null;
  /** Part du temps connecté qui a été payée, en points de pourcentage. */
  partPayee: number | null;
  coursesParHeure: number | null;
}

const estNombre = (valeur: number | null): valeur is number =>
  valeur !== null && Number.isFinite(valeur);

/**
 * Assemble une date et deux heures en deux horodatages.
 *
 * Une déconnexion antérieure ou égale à la connexion signifie que la session a
 * traversé minuit : le livreur saisit l'heure qu'il a lue, pas une date. On
 * ajoute donc un jour plutôt que de lui demander de le faire.
 */
export const horodatagesSession = (
  date: string,
  heureConnexion: string,
  heureDeconnexion: string
): { connexionLe: string; deconnexionLe: string } | null => {
  if (date === "" || heureConnexion === "" || heureDeconnexion === "") return null;

  const connexion = Date.parse(`${date}T${heureConnexion}:00Z`);
  let deconnexion = Date.parse(`${date}T${heureDeconnexion}:00Z`);

  if (Number.isNaN(connexion) || Number.isNaN(deconnexion)) return null;

  if (deconnexion <= connexion) {
    deconnexion += MINUTES_PAR_JOUR * 60_000;
  }

  return {
    connexionLe: new Date(connexion).toISOString(),
    deconnexionLe: new Date(deconnexion).toISOString(),
  };
};

export const dureeConnecteeMinutes = (session: Session): number | null => {
  if (session.connexionLe === null || session.deconnexionLe === null) return null;

  const debut = Date.parse(session.connexionLe);
  const fin = Date.parse(session.deconnexionLe);

  if (Number.isNaN(debut) || Number.isNaN(fin)) return null;

  const minutes = (fin - debut) / 60_000;
  return minutes > 0 ? minutes : null;
};

export const calculerSession = (session: Session): ResultatSession => {
  const duree = dureeConnecteeMinutes(session);

  if (duree === null) {
    return {
      dureeConnecteeMinutes: null,
      tauxHoraireConnecte: null,
      partPayee: null,
      coursesParHeure: null,
    };
  }

  const heures = duree / MINUTES_PAR_HEURE;

  return {
    dureeConnecteeMinutes: duree,
    tauxHoraireConnecte: estNombre(session.revenuPlateformeEuros)
      ? session.revenuPlateformeEuros / heures
      : null,
    partPayee: estNombre(session.minutesEnCourse)
      ? (session.minutesEnCourse / duree) * 100
      : null,
    coursesParHeure: estNombre(session.nombreCourses) ? session.nombreCourses / heures : null,
  };
};
