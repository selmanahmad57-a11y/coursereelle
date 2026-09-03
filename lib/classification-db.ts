/**
 * L'écriture des classifications, par générations.
 *
 * CE QUE CETTE TABLE EST, ET N'EST PAS. Elle n'est pas la source de ce que le
 * site affiche : la page des courses classe en direct, avec la même fonction,
 * parce qu'une course se juge selon les barèmes en vigueur à SA date et que le
 * résultat est donc déterministe. Cette table est la trace de ce qui a été
 * conclu, et quand — ce que le calcul en direct ne peut pas dire.
 *
 * Elle sert le jour où un barème change. Un avenant publié, une grille corrigée,
 * et la classification d'une course peut basculer : sans historique, le site
 * aurait changé d'avis en silence. Avec lui, la bascule est un événement daté,
 * qui porte le barème invoqué et les deux valeurs comparées.
 *
 * D'où la règle d'écriture : une nouvelle génération n'est écrite que si elle
 * DIFFÈRE de la précédente. Un journal qui grossit à chaque passage cesse d'être
 * lisible, et ce qui n'est plus lu ne prouve plus rien.
 */

import { memeClassification, type Classement } from "./classification.ts";
import { db } from "./db.ts";

export interface Generation {
  calculeeLe: string | null;
  classements: Classement[];
}

const enNombre = (valeur: string | number | null): number | null =>
  valeur === null ? null : Number(valeur);

/** La classification en vigueur d'une course : sa dernière génération. */
export const generationActuelle = async (courseId: string): Promise<Generation> => {
  const lignes = (await db()`
    select categorie, cle_bareme, valeur_bareme, valeur_constatee, unite, calculee_le
    from classifications
    where course_id = ${courseId}
      and calculee_le = (
        select max(calculee_le) from classifications where course_id = ${courseId}
      )
  `) as {
    categorie: string;
    cle_bareme: string | null;
    valeur_bareme: string | number | null;
    valeur_constatee: string | number | null;
    unite: string | null;
    calculee_le: string | Date;
  }[];

  if (lignes.length === 0) return { calculeeLe: null, classements: [] };

  return {
    calculeeLe:
      lignes[0].calculee_le instanceof Date
        ? lignes[0].calculee_le.toISOString()
        : String(lignes[0].calculee_le),
    classements: lignes.map((ligne) => ({
      categorie: ligne.categorie as Classement["categorie"],
      cleBareme: ligne.cle_bareme,
      valeurBareme: enNombre(ligne.valeur_bareme),
      valeurConstatee: enNombre(ligne.valeur_constatee),
      unite: ligne.unite,
    })),
  };
};

export interface EcritureClassification {
  ecrite: boolean;
  /** Renseigné seulement quand une génération a été écrite. */
  calculeeLe: string | null;
}

/**
 * Écrit une génération, sauf si elle répète la précédente.
 *
 * L'horodatage est calculé ici, une fois, et partagé par toutes les lignes du
 * lot : sur une connexion sans transaction, `now()` renverrait un instant
 * différent à chaque insertion et scinderait une même génération en plusieurs.
 */
export const enregistrerClassification = async (
  courseId: string,
  dateCourse: string,
  classements: readonly Classement[]
): Promise<EcritureClassification> => {
  const actuelle = await generationActuelle(courseId);

  if (actuelle.classements.length > 0 && memeClassification(actuelle.classements, classements)) {
    return { ecrite: false, calculeeLe: null };
  }

  const calculeeLe = new Date().toISOString();
  const sql = db();

  for (const classement of classements) {
    await sql`
      insert into classifications
        (course_id, categorie, cle_bareme, valeur_bareme, valeur_constatee, unite,
         date_reference, calculee_le)
      values
        (${courseId}, ${classement.categorie}, ${classement.cleBareme},
         ${classement.valeurBareme}, ${classement.valeurConstatee}, ${classement.unite},
         ${dateCourse}, ${calculeeLe})
      on conflict (course_id, categorie, calculee_le) do nothing
    `;
  }

  return { ecrite: true, calculeeLe };
};
