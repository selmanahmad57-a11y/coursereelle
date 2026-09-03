/**
 * Ce que le tableau de surveillance lit.
 *
 * Uniquement des agrégats, jamais une course nominative — il n'y a de toute
 * façon aucun nom en base. L'instrument sert à régler le système : voir ce que
 * les filtres écartent, et sur quoi ils hésitent.
 *
 * Aucune de ces fonctions n'écrit quoi que ce soit. La page qui les appelle
 * n'expose aucune action, et c'est volontaire : le système décide, l'humain
 * règle le système.
 */

import { repartitionCaptures, type CaptureSuivie } from "./cycle-capture.ts";
import { baseDisponible, db } from "./db.ts";
import { delaiSuppressionCaptureHeures } from "./parametres";

export interface Compte {
  cle: string;
  nombre: number;
}

export interface SaisieLibre {
  saisie: string;
  nombre: number;
}

export interface EtatSurveillance {
  base: boolean;
  statuts: Compte[];
  rejets: Compte[];
  signalements: Compte[];
  villesLibres: SaisieLibre[];
  antiFraude: Compte[];
  typesCapture: Compte[];
  captures: Compte[];
}

const VIDE: EtatSurveillance = {
  base: false,
  statuts: [],
  rejets: [],
  signalements: [],
  villesLibres: [],
  antiFraude: [],
  typesCapture: [],
  captures: [],
};

/** Un motif de rejet peut en contenir plusieurs, séparés par des virgules. */
const eclaterMotifs = (lignes: { motif: string | null; nombre: number }[]): Compte[] => {
  const totaux = new Map<string, number>();

  for (const ligne of lignes) {
    for (const motif of (ligne.motif ?? "").split(",").map((part) => part.trim())) {
      if (motif === "") continue;
      totaux.set(motif, (totaux.get(motif) ?? 0) + Number(ligne.nombre));
    }
  }

  return [...totaux.entries()]
    .map(([cle, nombre]) => ({ cle, nombre }))
    .sort((a, b) => b.nombre - a.nombre);
};

export const lireSurveillance = async (): Promise<EtatSurveillance> => {
  if (!baseDisponible()) return VIDE;

  const sql = db();

  const [statuts, rejets, signalements, villesLibres, empreintes, soumissions, pauses, suivies, types] =
    await Promise.all([
      sql`select statut, count(*)::int as nombre from courses group by statut order by statut`,
      sql`select motif_rejet as motif, count(*)::int as nombre from courses where statut = 'rejetee_auto' group by motif_rejet`,
      sql`select code, count(*)::int as nombre from signalements group by code order by code`,
      sql`
        select saisie_brute as saisie, count(*)::int as nombre
        from villes_saisies_libres
        where ville_slug_normalise is null
        group by saisie_brute
        order by nombre desc, saisie_brute
        limit 50
      `,
      sql`select count(distinct empreinte)::int as nombre from soumissions_horaires`,
      sql`select coalesce(sum(compteur), 0)::int as nombre from soumissions_horaires where heure >= now() - interval '24 hours'`,
      sql`select count(*)::int as nombre from activite_appareil where pause_jusqu_a > now()`,
      sql`
        select id, capture_cle_r2, verdict_le, capture_supprimee_le
        from courses
        where capture_cle_r2 is not null or capture_supprimee_le is not null
      `,
      sql`
        select coalesce(type_capture, 'non_reconnu') as type, count(*)::int as nombre
        from courses
        where capture_hash is not null
        group by 1
        order by nombre desc
      `,
    ]);

  return {
    base: true,
    statuts: (statuts as { statut: string; nombre: number }[]).map((ligne) => ({
      cle: ligne.statut,
      nombre: Number(ligne.nombre),
    })),
    rejets: eclaterMotifs(rejets as { motif: string | null; nombre: number }[]),
    signalements: (signalements as { code: string; nombre: number }[]).map((ligne) => ({
      cle: ligne.code,
      nombre: Number(ligne.nombre),
    })),
    villesLibres: (villesLibres as { saisie: string; nombre: number }[]).map((ligne) => ({
      saisie: ligne.saisie,
      nombre: Number(ligne.nombre),
    })),
    typesCapture: (types as { type: string; nombre: number }[]).map((ligne) => ({
      cle: ligne.type,
      nombre: Number(ligne.nombre),
    })),
    captures: Object.entries(
      repartitionCaptures(
        (
          suivies as {
            id: string;
            capture_cle_r2: string | null;
            verdict_le: string | Date | null;
            capture_supprimee_le: string | Date | null;
          }[]
        ).map<CaptureSuivie>((ligne) => ({
          id: ligne.id,
          cleR2: ligne.capture_cle_r2,
          verdictLe: ligne.verdict_le ? new Date(ligne.verdict_le).toISOString() : null,
          supprimeeLe: ligne.capture_supprimee_le
            ? new Date(ligne.capture_supprimee_le).toISOString()
            : null,
        })),
        new Date().toISOString(),
        delaiSuppressionCaptureHeures(new Date().toISOString().slice(0, 10))
      )
    ).map(([cle, nombre]) => ({ cle, nombre })),
    antiFraude: [
      { cle: "empreintes_suivies", nombre: Number((empreintes as { nombre: number }[])[0].nombre) },
      { cle: "soumissions_24h", nombre: Number((soumissions as { nombre: number }[])[0].nombre) },
      { cle: "appareils_en_pause", nombre: Number((pauses as { nombre: number }[])[0].nombre) },
    ],
  };
};
