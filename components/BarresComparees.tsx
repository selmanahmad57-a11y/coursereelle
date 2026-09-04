import { manque, proportions } from "@/lib/comparaison.ts";

export interface LigneComparee {
  cle: string;
  /** Ce que la ligne nomme : « Mesuré », « Annoncé ». */
  libelle: string;
  valeur: number | null;
  /** La valeur telle qu'elle s'écrit, avec son unité. */
  lisible: string;
  /** D'où sort ce nombre. Chaque chiffre du site porte son origine. */
  provenance: string | null;
  /**
   * Une mesure porte la couleur pleine ; une annonce reste grise. Le gris n'est
   * pas une nuance de style : il dit qu'un chiffre annoncé n'est pas une preuve.
   */
  mesuree: boolean;
  /**
   * La couleur d'alerte n'est autorisée que sur un manque réel. Colorer toute
   * différence marquerait aussi les courses mieux payées que le barème, et une
   * alerte qui se déclenche sur un bon cas apprend à être ignorée.
   */
  alerte: boolean;
}

/**
 * Deux montants comparés, dessinés en CSS nu.
 *
 * Aucune bibliothèque : deux div et une largeur en pourcentage suffisent, et ce
 * qui n'est pas chargé ne ralentit personne sur un téléphone en 4G.
 *
 * Les longueurs viennent de `lib/comparaison.ts`, dont les tests interdisent les
 * trois tricheries habituelles — échelle tronquée, minimum visuel, écart
 * exagéré. Le dessin est donc une conséquence des nombres, pas une illustration.
 *
 * Les barres sont masquées aux lecteurs d'écran : les montants sont écrits juste
 * à côté, et les faire lire deux fois n'aiderait personne.
 */
export default function BarresComparees({
  lignes,
  libelleManque,
  legende,
}: {
  lignes: readonly LigneComparee[];
  libelleManque: string;
  legende: string;
}) {
  const parts = proportions(lignes.map(({ cle, valeur }) => ({ cle, valeur })));

  if (parts.length < 2) return null;

  return (
    <div className="mt-5">
      <div className="space-y-4">
        {lignes.map((ligne) => {
          const part = parts.find((candidate) => candidate.cle === ligne.cle);
          if (part === undefined) return null;

          const restant = manque(part);

          return (
            <div key={ligne.cle}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="etiquette-section">
                  {ligne.libelle}
                </span>
                <span
                  className={`font-mono text-2xl font-semibold tabular-nums ${
                    ligne.mesuree ? "text-mesure" : "text-neutral-700"
                  }`}
                >
                  {ligne.lisible}
                </span>
              </div>

              <div className="mt-1.5 flex h-3 w-full overflow-hidden rounded-sm" aria-hidden="true">
                <div
                  className={ligne.mesuree ? "bg-mesure" : "bg-neutral-400"}
                  style={{ width: `${part.part}%` }}
                />
                {restant > 0 && ligne.alerte ? (
                  /* Le manque est hachuré plutôt qu'aplati : il se voit sans se
                     donner pour une mesure — c'est ce qui n'a pas été payé. */
                  <div
                    className="border-l-2 border-ecart bg-ecart-clair"
                    style={{
                      width: `${restant}%`,
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--color-ecart) 0 2px, transparent 2px 6px)",
                    }}
                  />
                ) : null}
                {restant > 0 && !ligne.alerte ? (
                  <div className="bg-neutral-200" style={{ width: `${restant}%` }} />
                ) : null}
              </div>

              {restant > 0 && ligne.alerte ? (
                <p className="mt-1 text-right text-xs font-semibold text-ecart">
                  {libelleManque}
                </p>
              ) : null}

              {ligne.provenance === null ? null : (
                <p className="mt-1 text-xs text-neutral-500">{ligne.provenance}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-neutral-500">{legende}</p>
    </div>
  );
}
