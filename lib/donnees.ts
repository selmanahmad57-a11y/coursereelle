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
import type { CaptureSuivie } from "./cycle-capture.ts";

export interface CourseVerifiee {
  dateCourse: string;
  plateforme: string;
  prixEuros: number;
  distanceKm: number;
  dureeReelleMinutes: number;
  dureeEstimeeMinutes: number | null;
  /**
   * L'état de la preuve, tel que la base le porte.
   *
   * L'accueil affirmait « la capture a été supprimée » depuis un texte fixe,
   * alors que le délai courait encore : une inférence publiée, contredite par le
   * compteur de la page Méthode. L'état voyage donc avec la course, et la phrase
   * se choisit par la MÊME fonction que les compteurs.
   */
  capture: CaptureSuivie;
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
    select id, date_course, plateforme, prix_paye_euros, distance_km,
           duree_reelle_minutes, duree_estimee_minutes,
           capture_cle_r2, capture_supprimee_le, verdict_le
    from courses
    where statut = 'validee_auto'
    order by verdict_le desc nulls last, soumise_le desc
    limit 1
  `) as {
    id: string;
    date_course: string | Date;
    plateforme: string;
    prix_paye_euros: string | number;
    distance_km: string | number;
    duree_reelle_minutes: string | number;
    duree_estimee_minutes: string | number | null;
    capture_cle_r2: string | null;
    capture_supprimee_le: string | Date | null;
    verdict_le: string | Date | null;
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
    capture: {
      id: ligne.id,
      cleR2: ligne.capture_cle_r2,
      verdictLe: ligne.verdict_le === null ? null : new Date(ligne.verdict_le).toISOString(),
      supprimeeLe:
        ligne.capture_supprimee_le === null
          ? null
          : new Date(ligne.capture_supprimee_le).toISOString(),
    },
  };
};

/* ------------------------------------------------------------------ */
/* La liste publique des courses                                       */
/* ------------------------------------------------------------------ */

/**
 * Une course telle que la liste publique la montre.
 *
 * La ville est la donnée la plus fine qui existe : ce n'est pas une décision de
 * cette couche, c'est qu'il n'y a rien d'autre en base. Aucun quartier, aucun
 * code postal, aucune adresse n'a jamais été collecté, donc aucun ne peut
 * fuir ici par distraction.
 */
export interface CoursePubliee {
  id: string;
  dateCourse: string;
  villeSlug: string | null;
  zone: string | null;
  plateforme: string;
  vehicule: string;
  distanceKm: number;
  prixEuros: number;
  dureeReelleMinutes: number;
  dureeEstimeeMinutes: number | null;
  /** Ce que la capture a confirmé, champ par champ. */
  statutsLecture: Record<string, string>;
}

export interface PageDeCourses {
  courses: CoursePubliee[];
  /** Nombre total de courses validées, toutes pages confondues. */
  total: number;
  /** Faux quand la base n'est pas branchée : la page l'explique au lieu d'afficher zéro. */
  disponible: boolean;
}

const enDate = (valeur: string | Date): string =>
  valeur instanceof Date ? valeur.toISOString().slice(0, 10) : String(valeur).slice(0, 10);

/**
 * Les courses validées, de la plus récente à la plus ancienne.
 *
 * L'ORDRE EST LA MÊME DÉCISION QUE CELLE DE L'ACCUEIL. Trier par taux horaire
 * croissant mettrait les pires courses en tête et donnerait une liste plus
 * frappante, entièrement composée de faits vrais — et pourtant l'ordre, lui,
 * serait une thèse. La date décroissante ne choisit rien : elle montre ce qui
 * vient d'arriver.
 */
export const lireCoursesPubliees = async (
  { page, parPage }: { page: number; parPage: number }
): Promise<PageDeCourses> => {
  if (!baseConfiguree()) return { courses: [], total: 0, disponible: false };

  const { db } = await import("./db.ts");

  const sql = db();
  const debut = Math.max(0, (page - 1) * parPage);

  const [lignes, total] = await Promise.all([
    sql`
      select id, date_course, ville_slug, zone, plateforme, vehicule,
             distance_km, prix_paye_euros, duree_reelle_minutes, duree_estimee_minutes
      from courses
      where statut = 'validee_auto'
      order by date_course desc, soumise_le desc
      limit ${parPage} offset ${debut}
    `,
    sql`select count(*)::int as nombre from courses where statut = 'validee_auto'`,
  ]);

  const courses = (lignes as {
    id: string;
    date_course: string | Date;
    ville_slug: string | null;
    zone: string | null;
    plateforme: string;
    vehicule: string;
    distance_km: string | number;
    prix_paye_euros: string | number;
    duree_reelle_minutes: string | number;
    duree_estimee_minutes: string | number | null;
  }[]).map((ligne) => ({
    id: ligne.id,
    dateCourse: enDate(ligne.date_course),
    villeSlug: ligne.ville_slug,
    zone: ligne.zone,
    plateforme: ligne.plateforme,
    vehicule: ligne.vehicule,
    distanceKm: Number(ligne.distance_km),
    prixEuros: Number(ligne.prix_paye_euros),
    dureeReelleMinutes: Number(ligne.duree_reelle_minutes),
    dureeEstimeeMinutes:
      ligne.duree_estimee_minutes === null ? null : Number(ligne.duree_estimee_minutes),
    statutsLecture: {} as Record<string, string>,
  }));

  /* Les statuts de vérification arrivent en une requête pour toute la page :
     une par course multiplierait les allers-retours sans rien apprendre de plus. */
  if (courses.length > 0) {
    const lectures = (await sql`
      select course_id, champ, statut_lecture
      from lectures_capture
      where course_id = any(${courses.map((course) => course.id) as string[]})
    `) as { course_id: string; champ: string; statut_lecture: string }[];

    const parCourse = new Map(courses.map((course) => [course.id, course]));

    for (const lecture of lectures) {
      const course = parCourse.get(lecture.course_id);
      if (course !== undefined) course.statutsLecture[lecture.champ] = lecture.statut_lecture;
    }
  }

  return {
    courses,
    total: Number((total as { nombre: number }[])[0].nombre),
    disponible: true,
  };
};

/* ------------------------------------------------------------------ */
/* Les statistiques de conformité et de sessions                       */
/* ------------------------------------------------------------------ */

export interface CompteCategorie {
  categorie: string;
  effectif: number;
}

export interface EcartConstate {
  categorie: string;
  /** Ce qui manque, en euros : le barème annoncé moins ce qui a été payé. */
  ecart: number;
}

export interface DonneesConformite {
  disponible: boolean;
  repartition: CompteCategorie[];
  ecarts: EcartConstate[];
}

/**
 * La classification en vigueur de chaque course validée.
 *
 * Une course porte plusieurs générations de classification — l'historique des
 * reclassifications — et seule la dernière décrit ce que le site conclut
 * aujourd'hui. Compter les autres reviendrait à publier d'anciens avis comme
 * s'ils étaient encore les siens.
 */
export const lireConformite = async (): Promise<DonneesConformite> => {
  if (!baseConfiguree()) return { disponible: false, repartition: [], ecarts: [] };

  const { db } = await import("./db.ts");
  const sql = db();

  const [repartition, ecarts] = await Promise.all([
    sql`
      select c.categorie, count(*)::int as nombre
      from classifications c
      join courses co on co.id = c.course_id
      where co.statut = 'validee_auto'
        and c.calculee_le = (
          select max(calculee_le) from classifications where course_id = c.course_id
        )
      group by c.categorie
    `,
    sql`
      select c.categorie, (c.valeur_bareme - c.valeur_constatee) as ecart
      from classifications c
      join courses co on co.id = c.course_id
      where co.statut = 'validee_auto'
        and c.unite = 'EUR_PAR_COURSE'
        and c.valeur_bareme is not null
        and c.valeur_constatee is not null
        and c.calculee_le = (
          select max(calculee_le) from classifications where course_id = c.course_id
        )
    `,
  ]);

  return {
    disponible: true,
    repartition: (repartition as { categorie: string; nombre: number }[]).map((ligne) => ({
      categorie: ligne.categorie,
      effectif: Number(ligne.nombre),
    })),
    ecarts: (ecarts as { categorie: string; ecart: string | number }[]).map((ligne) => ({
      categorie: ligne.categorie,
      ecart: Number(ligne.ecart),
    })),
  };
};

export interface DonneesSessions {
  disponible: boolean;
  /** Toutes les sessions validées. */
  effectif: number;
  /**
   * Le rapport entre le temps passé en course et le temps connecté, en points
   * de pourcentage. Sous-échantillon : seules les sessions dont l'application a
   * donné le temps en course y figurent, ce que la page Méthode annonce.
   */
  ratios: number[];
}

export const lireDonneesSessions = async (): Promise<DonneesSessions> => {
  if (!baseConfiguree()) return { disponible: false, effectif: 0, ratios: [] };

  const { db } = await import("./db.ts");
  const sql = db();

  const [total, lignes] = await Promise.all([
    sql`select count(*)::int as nombre from sessions where statut = 'validee_auto'`,
    sql`
      select temps_en_course_minutes,
             extract(epoch from (deconnexion_le - connexion_le)) / 60 as minutes_connectees
      from sessions
      where statut = 'validee_auto' and temps_en_course_minutes is not null
    `,
  ]);

  const ratios = (lignes as {
    temps_en_course_minutes: string | number;
    minutes_connectees: string | number;
  }[])
    .map((ligne) => ({
      course: Number(ligne.temps_en_course_minutes),
      connecte: Number(ligne.minutes_connectees),
    }))
    .filter(({ course, connecte }) => Number.isFinite(course) && connecte > 0)
    .map(({ course, connecte }) => (course / connecte) * 100);

  return {
    disponible: true,
    effectif: Number((total as { nombre: number }[])[0].nombre),
    ratios,
  };
};
