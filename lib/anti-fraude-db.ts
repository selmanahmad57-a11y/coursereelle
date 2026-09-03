/**
 * L'anti-fraude, côté base.
 *
 * Ce module fait le va-et-vient entre la base et `lib/validation/anti-fraude.ts`,
 * qui décide. Il n'écrit jamais d'adresse : seulement des empreintes salées, et
 * seulement sous le sel du jour.
 *
 * Le sel de la journée est tiré à la première soumission et supprimé passée la
 * fenêtre de rétention. À partir de là, les empreintes calculées avec lui sont
 * irréversibles — y compris pour nous.
 */

import { db } from "./db.ts";
import {
  empreintesCandidates,
  type EtatAppareil,
  type SeauHoraire,
  type SelJournalier,
} from "./validation/anti-fraude.ts";

const MILLISECONDES_PAR_JOUR = 86_400_000;

const enJour = (instant: Date): string => instant.toISOString().slice(0, 10);

const selAleatoire = (): string => {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(octets)
    .map((octet) => octet.toString(16).padStart(2, "0"))
    .join("");
};

/** Le début de l'heure en cours : c'est la clé des seaux de comptage. */
export const debutHeure = (instant: Date): string => {
  const copie = new Date(instant);
  copie.setUTCMinutes(0, 0, 0);
  return copie.toISOString();
};

/**
 * Garantit qu'un sel existe pour aujourd'hui, puis rend tous les sels encore
 * retenus. Ce sont eux qui permettent de retrouver un appareil de l'autre côté
 * de minuit.
 */
export const selsRetenus = async (
  maintenant: Date,
  retentionJours: number
): Promise<SelJournalier[]> => {
  const sql = db();
  const jour = enJour(maintenant);
  const depuis = enJour(new Date(maintenant.getTime() - retentionJours * MILLISECONDES_PAR_JOUR));

  await sql`
    insert into sels_journaliers (jour, sel)
    values (${jour}, ${selAleatoire()})
    on conflict (jour) do nothing
  `;

  const lignes = (await sql`
    select jour::text as jour, sel from sels_journaliers where jour >= ${depuis} order by jour desc
  `) as { jour: string; sel: string }[];

  return lignes;
};

export const empreintesDe = async (
  adresse: string,
  sels: readonly SelJournalier[]
): Promise<string[]> => empreintesCandidates(adresse, sels);

export const seauxRecents = async (
  empreintes: readonly string[],
  depuis: Date
): Promise<SeauHoraire[]> => {
  if (empreintes.length === 0) return [];

  const sql = db();
  const lignes = (await sql`
    select empreinte, heure, compteur
    from soumissions_horaires
    where empreinte = any(${empreintes as string[]}) and heure >= ${depuis.toISOString()}
  `) as { empreinte: string; heure: string | Date; compteur: number }[];

  return lignes.map((ligne) => ({
    empreinte: ligne.empreinte,
    heure: new Date(ligne.heure).toISOString(),
    compteur: Number(ligne.compteur),
  }));
};

export const etatsAppareil = async (
  empreintes: readonly string[]
): Promise<EtatAppareil[]> => {
  if (empreintes.length === 0) return [];

  const sql = db();
  const lignes = (await sql`
    select empreinte, echecs_ocr_consecutifs, pause_jusqu_a
    from activite_appareil
    where empreinte = any(${empreintes as string[]})
  `) as {
    empreinte: string;
    echecs_ocr_consecutifs: number;
    pause_jusqu_a: string | Date | null;
  }[];

  return lignes.map((ligne) => ({
    empreinte: ligne.empreinte,
    echecsOcrConsecutifs: Number(ligne.echecs_ocr_consecutifs),
    pauseJusqua: ligne.pause_jusqu_a ? new Date(ligne.pause_jusqu_a).toISOString() : null,
  }));
};

/** Une soumission de plus, comptée sous le sel du jour uniquement. */
export const compterSoumission = async (empreinte: string, maintenant: Date): Promise<void> => {
  const sql = db();

  await sql`
    insert into soumissions_horaires (empreinte, heure, compteur)
    values (${empreinte}, ${debutHeure(maintenant)}, 1)
    on conflict (empreinte, heure) do update set compteur = soumissions_horaires.compteur + 1
  `;
};

/**
 * Purge. C'est la suppression du sel qui rend les empreintes du jour concerné
 * définitivement irréversibles ; les compteurs partent avec lui.
 */
export const purgerEmpreintes = async (
  maintenant: Date,
  retentionJours: number
): Promise<void> => {
  const sql = db();
  const limiteJour = enJour(
    new Date(maintenant.getTime() - retentionJours * MILLISECONDES_PAR_JOUR)
  );
  const limiteHeure = new Date(
    maintenant.getTime() - retentionJours * MILLISECONDES_PAR_JOUR
  ).toISOString();

  await sql`delete from sels_journaliers where jour < ${limiteJour}`;
  await sql`delete from activite_appareil where jour < ${limiteJour}`;
  await sql`delete from soumissions_horaires where heure < ${limiteHeure}`;
};
