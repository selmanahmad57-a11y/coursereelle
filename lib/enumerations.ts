/**
 * Les énumérations exposées au formulaire.
 *
 * Elles sont lues dans le schéma plutôt que recopiées : ajouter une plateforme
 * ou un véhicule au schéma les fait apparaître dans le formulaire, et
 * `tests/libelles.test.mjs` garantit qu'aucune valeur ne peut s'afficher sans
 * libellé français.
 */

import schema from "@/config/baremes.schema.json";
import libelles from "@/config/libelles.json";

export interface Option {
  valeur: string;
  libelle: string;
}

const enOptions = (valeurs: string[], table: Record<string, string>): Option[] =>
  valeurs.map((valeur) => ({ valeur, libelle: table[valeur] ?? valeur }));

export const plateformes: Option[] = enOptions(
  schema.$defs.plateforme.enum,
  libelles.plateformes
);

export const vehicules: Option[] = enOptions(schema.$defs.vehicule.enum, libelles.vehicules);

export const libelleZone = (zone: string): string =>
  (libelles.zones as Record<string, string>)[zone] ?? zone;
