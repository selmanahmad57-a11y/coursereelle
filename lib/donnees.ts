/**
 * Accès aux données publiées.
 *
 * Tant que la base n'est pas branchée, cette couche ne rend RIEN plutôt que
 * quelque chose. Elle n'a délibérément aucune valeur de repli, aucun jeu de
 * démonstration, aucun chiffre d'exemple : un site de vérité qui afficherait
 * une valeur inventée, même par accident de déploiement, aurait tout perdu.
 *
 * Les fixtures existent, mais elles vivent dans tests/ et ne peuvent pas être
 * importées d'ici : `tests/frontieres.test.mjs` lit le code de app/, components/
 * et lib/ et refuse tout chemin d'importation qui y ressemble.
 *
 * Quand le pilote Neon sera branché, seule cette fonction change.
 */

/**
 * Une course vérifiée, telle que l'accueil la montre.
 *
 * Ni ville ni date : l'accueil n'a pas besoin de situer la course pour montrer
 * l'écart, et une course unique, datée et localisée, en dit plus sur celui qui
 * l'a faite qu'une ligne dans une liste. La ville reste la granularité maximale
 * du site ; l'accueil, lui, descend encore d'un cran et n'en dit rien.
 *
 * La date de la course sert quand même : c'est elle qui résout les barèmes
 * annoncés, puisqu'une course se juge selon les règles en vigueur à sa date.
 */
export interface CourseVerifiee {
  dateCourse: string;
  plateforme: string;
  prixEuros: number;
  distanceKm: number;
  dureeReelleMinutes: number;
  dureeEstimeeMinutes: number | null;
}

export interface DonneesPubliques {
  /** Faux tant que les requêtes ne sont pas branchées : rien n'est affichable. */
  requetesDisponibles: boolean;
  /** Taux horaires plateforme, hors pourboires, des courses validées. */
  tauxHorairesPlateforme: number[];
  /** Toutes les courses reçues, quel que soit leur statut : la provenance du compteur. */
  effectifRecu: number;
}

/** La base est-elle au moins configurée ? Sert à expliquer l'état, jamais à inventer. */
export const baseConfiguree = (): boolean =>
  typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";

/*
 * Seules les courses VALIDÉES entrent ici. Tant que la lecture automatique de la
 * capture n'est pas branchée, aucune course n'atteint ce statut : le compteur
 * public affiche donc zéro, ce qui est la vérité, et non une estimation.
 */
export const lireDonneesPubliques = async (): Promise<DonneesPubliques> => {
  if (!baseConfiguree()) {
    return { requetesDisponibles: false, tauxHorairesPlateforme: [], effectifRecu: 0 };
  }

  const { db } = await import("./db.ts");

  const sql = db();

  const [lignes, recues] = await Promise.all([
    sql`
      select prix_paye_euros / (duree_reelle_minutes / 60.0) as taux
      from courses
      where statut = 'validee_auto' and duree_reelle_minutes > 0
    `,
    sql`select count(*)::int as nombre from courses`,
  ]);

  return {
    requetesDisponibles: true,
    tauxHorairesPlateforme: (lignes as { taux: string | number }[]).map((ligne) =>
      Number(ligne.taux)
    ),
    effectifRecu: Number((recues as { nombre: number }[])[0].nombre),
  };
};

/**
 * La dernière course vérifiée, ou rien.
 *
 * LE CHOIX DE « LA DERNIÈRE » EST DÉLIBÉRÉ, et l'accueil l'énonce. Retenir la
 * course la moins bien payée donnerait un chiffre plus frappant, et ce chiffre
 * serait vrai — mais la règle de sélection, elle, serait une thèse déguisée en
 * observation. Un site qui reproche aux plateformes de communiquer sur leurs
 * meilleurs cas ne peut pas communiquer sur ses pires.
 *
 * Rien n'est rendu si aucune course n'est vérifiée : l'accueil affiche alors
 * l'absence, jamais un exemple.
 */
export const lireDerniereCourseVerifiee = async (): Promise<CourseVerifiee | null> => {
  if (!baseConfiguree()) return null;

  const { db } = await import("./db.ts");

  const lignes = (await db()`
    select date_course, plateforme, prix_paye_euros, distance_km,
           duree_reelle_minutes, duree_estimee_minutes
    from courses
    where statut = 'validee_auto'
    order by verdict_le desc nulls last, soumise_le desc
    limit 1
  `) as {
    date_course: string | Date;
    plateforme: string;
    prix_paye_euros: string | number;
    distance_km: string | number;
    duree_reelle_minutes: string | number;
    duree_estimee_minutes: string | number | null;
  }[];

  if (lignes.length === 0) return null;

  const ligne = lignes[0];

  return {
    dateCourse:
      ligne.date_course instanceof Date
        ? ligne.date_course.toISOString().slice(0, 10)
        : String(ligne.date_course).slice(0, 10),
    plateforme: ligne.plateforme,
    prixEuros: Number(ligne.prix_paye_euros),
    distanceKm: Number(ligne.distance_km),
    dureeReelleMinutes: Number(ligne.duree_reelle_minutes),
    dureeEstimeeMinutes:
      ligne.duree_estimee_minutes === null ? null : Number(ligne.duree_estimee_minutes),
  };
};
