/**
 * La construction des règles du filtre de lecture.
 *
 * Deux consommateurs, encore : le script `npm run lecture` et la route
 * périodique appelée par le planificateur. Chacun assemblait ses seuils à sa
 * façon, ce qui revenait à écrire deux fois la même lecture de la
 * configuration — avec la certitude qu'un jour l'une des deux oublierait un
 * seuil ajouté à l'autre.
 *
 * Module pur : la configuration arrive en paramètre, parce que le script la lit
 * sur le disque et que la route l'importe.
 */

import {
  reglesClassificationDepuis,
  type BaremesBruts,
} from "./classification-regles.ts";
import { CLES_SYSTEME } from "./cles.ts";
import { uniqueEnVigueur } from "./periodes.ts";
import type { ReglesTraitement } from "./traitement-lecture.ts";

export interface InterfacePlateforme {
  champs_verifiables: Record<string, string>;
  motifs: Record<string, string>;
}

export interface ReglesCaptures {
  politique_verification: {
    probants: readonly string[];
    declaratifs: readonly string[];
  };
}

const valeur = (baremes: BaremesBruts, cle: string, date: string): number | null =>
  uniqueEnVigueur(
    baremes.parametres_systeme.filter((entree) => entree.cle === cle),
    date
  )?.valeur ?? null;

export interface ReglagesTaches {
  lecture: { agrandissement_second_essai: number };
}

export const reglesTraitementDepuis = (
  baremes: BaremesBruts,
  interfacePlateforme: InterfacePlateforme,
  captures: ReglesCaptures,
  taches: ReglagesTaches,
  date: string
): ReglesTraitement => {
  /* La note explicative et le nom du champ indispensable vivent à côté de la
     correspondance champ → motif : on les met de côté avant de la parcourir. */
  const parChamp = Object.entries(interfacePlateforme.champs_verifiables).filter(
    ([cle]) => cle !== "note" && cle !== "indispensable"
  );

  return {
    lecture: {
      motifs: Object.fromEntries(
        parChamp.map(([champ, nom]) => [champ, interfacePlateforme.motifs[nom]])
      ),
      confianceMinimale: valeur(baremes, CLES_SYSTEME.confianceMinimaleLecture, date) ?? 0,
    },
    tolerances: {
      prixEuros: valeur(baremes, CLES_SYSTEME.tolerancePrix, date),
      distanceKm: valeur(baremes, CLES_SYSTEME.toleranceDistance, date),
      dureeEstimeeMinutes: valeur(baremes, CLES_SYSTEME.toleranceDureeEstimee, date),
    },
    champsFacultatifs: captures.politique_verification.declaratifs,
    champsProbants: captures.politique_verification.probants,
    agrandissementSecondEssai: taches.lecture.agrandissement_second_essai,
    reglesClassification: (dateCourse, contexte) =>
      reglesClassificationDepuis(baremes, dateCourse, contexte),
  } as ReglesTraitement;
};
