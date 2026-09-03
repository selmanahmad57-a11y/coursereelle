import libelles from "@/config/libelles.json";
import { formaterValeur } from "@/lib/baremes";
import { UNITES } from "@/lib/cles";
import type { Resultat } from "@/lib/calculs";
import type { Anomalie } from "@/lib/validation/regles-physiques";

const textes = libelles.formulaire.resultats;

const tablesAnomalies = libelles.anomalies as Record<string, { unite: string; message: string }>;

/** Remplace {valeur} et {limite} par les nombres mis en forme dans l'unité déclarée. */
const messageAnomalie = (anomalie: Anomalie): string => {
  const modele = tablesAnomalies[anomalie.code];
  if (!modele) return anomalie.code;

  return modele.message
    .replace("{valeur}", formaterValeur(anomalie.valeur, modele.unite))
    .replace("{limite}", formaterValeur(anomalie.limite, modele.unite));
};

function Ligne({
  intitule,
  valeur,
  accent = false,
}: {
  intitule: string;
  valeur: string | null;
  accent?: boolean;
}) {
  if (valeur === null) return null;

  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-neutral-600">{intitule}</dt>
      <dd
        className={`font-mono tabular-nums ${
          accent ? "text-xl font-semibold text-neutral-900" : "text-sm text-neutral-800"
        }`}
      >
        {valeur}
      </dd>
    </div>
  );
}

export default function CalculEnDirect({
  resultat,
  anomalies,
}: {
  resultat: Resultat;
  anomalies: Anomalie[];
}) {
  const mettreEnForme = (valeur: number | null, unite: string) =>
    valeur === null ? null : formaterValeur(valeur, unite);

  const rienACalculer = resultat.tauxHoraireReel === null;

  return (
    <div className="space-y-4">
      <section
        aria-live="polite"
        className="rounded-lg border border-neutral-200 bg-white p-4"
      >
        <h2 className="text-sm font-medium text-neutral-900">{textes.titre}</h2>

        {rienACalculer ? (
          <p className="mt-2 text-sm text-neutral-600">{textes.attente}</p>
        ) : (
          <dl className="mt-2 divide-y divide-neutral-100">
            <Ligne
              accent
              intitule={textes.taux_reel}
              valeur={mettreEnForme(resultat.tauxHoraireReel, UNITES.euroParHeure)}
            />
            <Ligne
              intitule={textes.taux_estime}
              valeur={mettreEnForme(resultat.tauxHoraireEstime, UNITES.euroParHeure)}
            />
            <Ligne
              intitule={textes.ecart}
              valeur={
                resultat.ecartRelatif === null
                  ? null
                  : `+ ${formaterValeur(resultat.ecartRelatif, UNITES.pourcent)}`
              }
            />
            <Ligne
              intitule={textes.net}
              valeur={mettreEnForme(resultat.tauxHoraireNetEstime, UNITES.euroParHeure)}
            />
            <Ligne
              intitule={textes.vitesse}
              valeur={mettreEnForme(resultat.vitesseMoyenne, UNITES.kilometreParHeure)}
            />
          </dl>
        )}
      </section>

      {anomalies.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-medium text-amber-900">
            {libelles.formulaire.anomalies_titre}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {anomalies.map((anomalie) => (
              <li key={anomalie.code} className="text-sm text-amber-900">
                {messageAnomalie(anomalie)}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-amber-200 pt-2 text-xs text-amber-800">
            {libelles.formulaire.anomalies_introduction}
          </p>
        </section>
      ) : null}
    </div>
  );
}
