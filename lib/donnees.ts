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

export interface DonneesPubliques {
  /** Faux tant que les requêtes ne sont pas branchées : rien n'est affichable. */
  requetesDisponibles: boolean;
  /** Taux horaires plateforme, hors pourboires, des courses validées. */
  tauxHorairesPlateforme: number[];
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
  if (!baseConfiguree()) return { requetesDisponibles: false, tauxHorairesPlateforme: [] };

  const { db } = await import("./db.ts");

  const lignes = (await db()`
    select prix_paye_euros / (duree_reelle_minutes / 60.0) as taux
    from courses
    where statut = 'validee_auto' and duree_reelle_minutes > 0
  `) as { taux: string | number }[];

  return {
    requetesDisponibles: true,
    tauxHorairesPlateforme: lignes.map((ligne) => Number(ligne.taux)),
  };
};
