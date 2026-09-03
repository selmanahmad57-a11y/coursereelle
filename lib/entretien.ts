/**
 * Entretien : suppression des captures dont le delai est ecoule.
 *
 * Ce module execute ce que `lib/cycle-capture.ts` decide. Il supprime d'abord
 * l'objet du stockage, puis marque la ligne : dans cet ordre, une panne au
 * milieu laisse une ligne encore marquee « a supprimer », qui sera reprise au
 * prochain passage. L'ordre inverse laisserait une image orpheline que plus
 * rien ne designerait.
 *
 * Aucun texte lu sur une capture ne transite ici, ni ailleurs.
 */

import { capturesEchues, repartitionCaptures, type CaptureSuivie } from "./cycle-capture.ts";
import { baseDisponible, db } from "./db.ts";
import { supprimerCapture } from "./r2.ts";

const lignesSuivies = async (): Promise<CaptureSuivie[]> => {
  const lignes = (await db()`
    select id, capture_cle_r2, verdict_le, capture_supprimee_le
    from courses
    where capture_cle_r2 is not null or capture_supprimee_le is not null
  `) as {
    id: string;
    capture_cle_r2: string | null;
    verdict_le: string | Date | null;
    capture_supprimee_le: string | Date | null;
  }[];

  return lignes.map((ligne) => ({
    id: ligne.id,
    cleR2: ligne.capture_cle_r2,
    verdictLe: ligne.verdict_le ? new Date(ligne.verdict_le).toISOString() : null,
    supprimeeLe: ligne.capture_supprimee_le
      ? new Date(ligne.capture_supprimee_le).toISOString()
      : null,
  }));
};

/*
 * Le delai arrive en parametre plutot que d'etre lu ici : ce module doit pouvoir
 * tourner hors de Next — depuis une tache planifiee, un script d'entretien — la
 * ou l'alias d'importation de la configuration n'existe pas.
 */
export const etatCaptures = async (maintenant: Date, delaiHeures: number | null) => {
  if (!baseDisponible()) return null;

  return repartitionCaptures(await lignesSuivies(), maintenant.toISOString(), delaiHeures);
};

export interface Entretien {
  examinees: number;
  supprimees: number;
  echecs: number;
}

export const supprimerCapturesEchues = async (
  maintenant: Date,
  delaiHeures: number | null
): Promise<Entretien> => {
  const sql = db();

  const suivies = await lignesSuivies();
  const echues = capturesEchues(suivies, maintenant.toISOString(), delaiHeures);

  let supprimees = 0;
  let echecs = 0;

  for (const capture of echues) {
    try {
      await supprimerCapture(capture.cleR2 as string);

      await sql`
        update courses
        set capture_cle_r2 = null, capture_supprimee_le = now()
        where id = ${capture.id}
      `;

      supprimees += 1;
    } catch (erreur) {
      /* On journalise l'identifiant de la course, jamais le contenu de l'image. */
      console.error(`[entretien] suppression impossible pour la course ${capture.id} :`, erreur);
      echecs += 1;
    }
  }

  return { examinees: echues.length, supprimees, echecs };
};
