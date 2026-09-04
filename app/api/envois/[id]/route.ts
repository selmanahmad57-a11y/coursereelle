/**
 * Le sort d'un envoi, interrogé un par un.
 *
 * UN SEUL IDENTIFIANT À LA FOIS, ET C'EST STRUCTUREL. L'adresse porte
 * l'identifiant : il n'existe aucune façon d'en demander plusieurs, donc aucune
 * façon de dessiner un profil en croisant une liste. Ce que cette route rend
 * pour un identifiant, le registre public le dirait déjà pour la course
 * correspondante — auxquels s'ajoutent les chiffres que le livreur a lui-même
 * saisis, et ceux que la capture a rendus.
 *
 * Connaître l'identifiant, c'est avoir soumis : un UUID ne se devine pas, et
 * rien ici n'en énumère.
 *
 * Aucun texte lu sur une capture ne traverse cette route — seulement des
 * nombres, des statuts et des motifs, comme partout ailleurs.
 */

import { db } from "@/lib/db.ts";
import { estIdentifiant } from "@/lib/envois.ts";
import { CHAMPS_VERIFIES } from "@/lib/validation/ocr.ts";

const reponse = (corps: Record<string, unknown>, code: number) =>
  Response.json(corps, { status: code });

export async function GET(_requete: Request, { params }: RouteContext<"/api/envois/[id]">) {
  const { id } = await params;

  if (!estIdentifiant(id)) {
    return reponse({ erreur: "identifiant_invalide" }, 400);
  }

  const sql = db();

  const lignes = (await sql`
    select statut, motif_rejet, soumise_le, verdict_le,
           prix_paye_euros, distance_km, duree_estimee_minutes,
           ocr_prix_euros, ocr_distance_km, ocr_duree_estimee_minutes
    from courses
    where id = ${id}
  `) as {
    statut: string;
    motif_rejet: string | null;
    soumise_le: string | Date;
    verdict_le: string | Date | null;
    prix_paye_euros: string | number;
    distance_km: string | number;
    duree_estimee_minutes: string | number | null;
    ocr_prix_euros: string | number | null;
    ocr_distance_km: string | number | null;
    ocr_duree_estimee_minutes: string | number | null;
  }[];

  if (lignes.length === 0) {
    return reponse({ erreur: "introuvable" }, 404);
  }

  const ligne = lignes[0];

  const lectures = (await sql`
    select champ, statut_lecture, confiance
    from lectures_capture
    where course_id = ${id}
  `) as { champ: string; statut_lecture: string; confiance: string | number | null }[];

  const nombre = (valeur: string | number | null) =>
    valeur === null ? null : Number(valeur);

  const saisi: Record<string, number | null> = {
    prixEuros: nombre(ligne.prix_paye_euros),
    distanceKm: nombre(ligne.distance_km),
    dureeEstimeeMinutes: nombre(ligne.duree_estimee_minutes),
  };

  const lu: Record<string, number | null> = {
    prixEuros: nombre(ligne.ocr_prix_euros),
    distanceKm: nombre(ligne.ocr_distance_km),
    dureeEstimeeMinutes: nombre(ligne.ocr_duree_estimee_minutes),
  };

  return reponse(
    {
      statut: ligne.statut,
      motif: ligne.motif_rejet,
      soumiseLe: new Date(ligne.soumise_le).toISOString(),
      verdictLe: ligne.verdict_le === null ? null : new Date(ligne.verdict_le).toISOString(),
      champs: CHAMPS_VERIFIES.map((champ) => ({
        champ,
        saisi: saisi[champ] ?? null,
        lu: lu[champ] ?? null,
        statutLecture:
          lectures.find((lecture) => lecture.champ === champ)?.statut_lecture ?? null,
      })),
    },
    200
  );
}
