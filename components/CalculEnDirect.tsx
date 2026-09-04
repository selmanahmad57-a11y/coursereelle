import libelles from "@/config/libelles.json";
import { formaterValeur } from "@/lib/baremes";
import { UNITES } from "@/lib/cles.ts";
import { remplir } from "@/lib/modeles.ts";
import type { Course, Resultat } from "@/lib/calculs.ts";
import type { Anomalie } from "@/lib/validation/regles-physiques.ts";

import { enDeca } from "@/lib/comparaison.ts";

import BarresComparees from "./BarresComparees";
import { Ligne } from "./Champ";

const textes = libelles.formulaire.resultats;
const modeles = textes.calculs;

const tablesAnomalies = libelles.anomalies as Record<string, { unite: string; message: string }>;

/** Remplace {valeur} et {limite} par les nombres mis en forme dans l'unité déclarée. */
const messageAnomalie = (anomalie: Anomalie): string => {
  const modele = tablesAnomalies[anomalie.code];
  if (!modele) return anomalie.code;

  return modele.message
    .replace("{valeur}", formaterValeur(anomalie.valeur, modele.unite))
    .replace("{limite}", formaterValeur(anomalie.limite, modele.unite));
};


export default function CalculEnDirect({
  course,
  resultat,
  tauxCotisations,
  anomalies,
}: {
  course: Course;
  resultat: Resultat;
  tauxCotisations: number | null;
  anomalies: Anomalie[];
}) {
  const mettreEnForme = (valeur: number | null, unite: string) =>
    valeur === null ? null : formaterValeur(valeur, unite);

  const rienACalculer = resultat.tauxPlateforme === null;

  /* Le taux avec pourboire ne s'affiche que s'il dit quelque chose de plus. */
  const avecPourboireDiffere =
    resultat.tauxAvecPourboire !== null &&
    resultat.tauxPlateforme !== null &&
    resultat.tauxAvecPourboire !== resultat.tauxPlateforme;

  /*
   * Les grandeurs telles que le livreur les a saisies. Elles servent à écrire le
   * calcul en toutes lettres : un chiffre qui ne montre pas d'où il sort se lit
   * comme une erreur, ce qu'un premier test réel a confirmé.
   */
  const saisi = {
    prix: mettreEnForme(course.prixPaye, UNITES.euroParCourse),
    pourboire: mettreEnForme(course.pourboire, UNITES.euroParCourse),
    distance: mettreEnForme(course.distanceKm, UNITES.kilometre),
    duree_reelle: mettreEnForme(course.dureeReelleMinutes, UNITES.minutes),
    duree_estimee: mettreEnForme(course.dureeEstimeeMinutes, UNITES.minutes),
    reel: mettreEnForme(resultat.tauxPlateforme, UNITES.euroParHeure),
    estime: mettreEnForme(resultat.tauxPlateformeEstime, UNITES.euroParHeure),
    taux: mettreEnForme(tauxCotisations, UNITES.pourcent),
  };

  return (
    <div className="space-y-4">
      <section
        aria-live="polite"
        className="carte"
      >
        <h2 className="etiquette-section">{textes.titre}</h2>

        {rienACalculer ? (
          <p className="mt-2 text-sm text-neutral-600">{textes.attente}</p>
        ) : (
          <>
            <BarresComparees
              legende={textes.barres.legende}
              libelleManque={
                resultat.ecartRelatif === null
                  ? textes.barres.manque
                  : `${textes.barres.manque} ${formaterValeur(resultat.ecartRelatif, UNITES.pourcent)}`
              }
              lignes={[
                {
                  cle: "reel",
                  libelle: textes.barres.reel,
                  valeur: resultat.tauxPlateforme,
                  lisible: mettreEnForme(resultat.tauxPlateforme, UNITES.euroParHeure) ?? "—",
                  provenance: remplir(modeles.taux_plateforme, saisi),
                  /* Déclaré, pas mesuré : rien n'est vérifié tant que la capture
                     n'a pas été lue. La couleur pleine est réservée à la preuve. */
                  mesuree: false,
                  alerte: enDeca(resultat.tauxPlateforme, resultat.tauxPlateformeEstime),
                },
                {
                  cle: "estime",
                  libelle: textes.barres.estime,
                  valeur: resultat.tauxPlateformeEstime,
                  lisible: mettreEnForme(resultat.tauxPlateformeEstime, UNITES.euroParHeure) ?? "—",
                  provenance: remplir(modeles.taux_plateforme_estime, saisi),
                  mesuree: false,
                  alerte: false,
                },
              ]}
            />

            <dl className="mt-4 divide-y divide-neutral-100">
              <Ligne
                accent
                calcul={remplir(modeles.taux_plateforme, saisi)}
                intitule={textes.taux_plateforme}
                valeur={mettreEnForme(resultat.tauxPlateforme, UNITES.euroParHeure)}
              />
              <Ligne
                calcul={remplir(modeles.avec_pourboire, saisi)}
                intitule={textes.avec_pourboire}
                valeur={
                  avecPourboireDiffere
                    ? mettreEnForme(resultat.tauxAvecPourboire, UNITES.euroParHeure)
                    : null
                }
              />
              <Ligne
                calcul={remplir(modeles.taux_plateforme_estime, saisi)}
                intitule={textes.taux_plateforme_estime}
                valeur={mettreEnForme(resultat.tauxPlateformeEstime, UNITES.euroParHeure)}
              />
              <Ligne
                calcul={remplir(modeles.ecart, saisi)}
                intitule={textes.ecart}
                valeur={
                  resultat.ecartRelatif === null
                    ? null
                    : `+ ${formaterValeur(resultat.ecartRelatif, UNITES.pourcent)}`
                }
              />
              <Ligne
                calcul={remplir(modeles.net, saisi)}
                intitule={textes.net}
                valeur={mettreEnForme(resultat.tauxPlateformeNet, UNITES.euroParHeure)}
              />
              <Ligne
                calcul={remplir(modeles.vitesse, saisi)}
                intitule={textes.vitesse}
                valeur={mettreEnForme(resultat.vitesseMoyenne, UNITES.kilometreParHeure)}
              />
            </dl>

            <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
              {textes.precision_pourboire}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{textes.provenance}</p>
          </>
        )}
      </section>

      {anomalies.length > 0 ? (
        <section className="rounded-lg border border-ecart/40 bg-ecart-clair p-4">
          <h2 className="text-sm font-medium text-ecart">
            {libelles.formulaire.anomalies_titre}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {anomalies.map((anomalie) => (
              <li key={anomalie.code} className="text-sm text-ecart">
                {messageAnomalie(anomalie)}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-ecart/30 pt-2 text-xs text-ecart">
            {libelles.formulaire.anomalies_introduction}
          </p>
        </section>
      ) : null}
    </div>
  );
}
