"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import libelles from "@/config/libelles.json";
import reglagesInterface from "@/config/interface.json";
import GuideCapture from "@/components/GuideCapture";
import { formaterValeur } from "@/lib/baremes";
import { UNITES } from "@/lib/cles.ts";
import { abonnerStockage } from "@/lib/contexte-livreur.ts";
import { decoderEnvois, envoisAuRendu, lireEnvois, type Envoi } from "@/lib/envois.ts";
import { appelleLeGuide } from "@/lib/motifs-guide.ts";

const textes = libelles.envois;

const motifs: Record<string, string> = {
  ...libelles.motifs_technique,
  ...libelles.motifs_ocr,
  ...libelles.motifs_authenticite,
  ...libelles.motifs_capture,
  ...libelles.motifs_anti_fraude,
};

const statuts: Record<string, string> = libelles.statuts;
const champsLisibles: Record<string, string> = libelles.champs_lecture;

const UNITE_PAR_CHAMP: Record<string, string> = {
  prixEuros: UNITES.euroParCourse,
  distanceKm: UNITES.kilometre,
  dureeEstimeeMinutes: UNITES.minutes,
};

interface Sort {
  statut: string;
  motif: string | null;
  soumiseLe: string;
  verdictLe: string | null;
  champs: { champ: string; saisi: number | null; lu: number | null; statutLecture: string | null }[];
}

/**
 * Le sort des envois de cet appareil.
 *
 * Chaque identifiant est demandé SÉPARÉMENT : le serveur ne voit jamais la
 * liste, donc ne peut pas la recouper. C'est la même règle que partout — ce qui
 * n'est pas envoyé ne peut pas fuir.
 */
export default function ListeEnvois() {
  /*
   * La liste vient du stockage, par le même mécanisme que la ville retenue : un
   * abonnement plutôt qu'un effet, pour que le rendu du serveur et celui du
   * navigateur ne se contredisent pas.
   */
  const memoire = useSyncExternalStore(abonnerStockage, lireEnvois, envoisAuRendu);

  /* Faux pendant le rendu du serveur : il n'y a pas de stockage là-bas, et une
     liste vide n'y voudrait pas dire « aucun envoi ». */
  const monte = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const envois = useMemo(
    () => decoderEnvois(memoire, reglagesInterface.envois.memorises_maximum),
    [memoire]
  );

  const [sorts, setSorts] = useState<Record<string, Sort | "introuvable">>({});

  useEffect(() => {
    let annule = false;

    (async () => {
      for (const envoi of envois) {
        try {
          const reponse = await fetch(`/api/envois/${envoi.id}`);
          const sort = reponse.ok ? ((await reponse.json()) as Sort) : "introuvable";
          if (!annule) setSorts((precedents) => ({ ...precedents, [envoi.id]: sort }));
        } catch {
          if (!annule) setSorts((precedents) => ({ ...precedents, [envoi.id]: "introuvable" }));
        }
      }
    })();

    return () => {
      annule = true;
    };
  }, [envois]);

  if (!monte) {
    return <p className="provenance mt-6">{textes.chargement}</p>;
  }

  if (envois.length === 0) {
    return <p className="carte mt-6 text-sm text-encre">{textes.aucun}</p>;
  }

  return (
    <ul className="mt-6 space-y-3">
      {envois.map((envoi) => {
        const sort = sorts[envoi.id];

        return (
          <li className="carte" key={envoi.id}>
            <p className="provenance">
              {textes.colonne_envoye} : {envoi.envoyeLe.slice(0, 10) || "—"}
            </p>

            {sort === undefined ? (
              <p className="mt-1 text-sm text-declare">{textes.chargement}</p>
            ) : sort === "introuvable" ? (
              <p className="mt-1 text-sm text-declare">{textes.introuvable}</p>
            ) : (
              <Sort envoi={envoi} sort={sort} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Sort({ envoi, sort }: { envoi: Envoi; sort: Sort }) {
  const divergences = sort.champs.filter(
    (champ) => champ.saisi !== null && champ.lu !== null && champ.saisi !== champ.lu
  );

  const enAttente = sort.statut === "en_attente_ocr";
  const validee = sort.statut === "validee_auto";

  return (
    <>
      <p className="mt-1">
        <span className={validee ? "puce-mesure" : enAttente ? "puce-declare" : "puce-ecart"}>
          {statuts[sort.statut] ?? sort.statut}
        </span>
      </p>

      <p className="mt-2 text-sm text-encre">
        {enAttente ? textes.attente : validee ? textes.validee : null}
        {!enAttente && !validee && sort.motif !== null
          ? (motifs[sort.motif] ?? sort.motif)
          : null}
      </p>

      {/* La divergence se montre en chiffres : ce sont les siens des deux côtés. */}
      {!validee && divergences.length > 0 ? (
        <div className="mt-3 border-t border-trait pt-3">
          <p className="etiquette-section">{textes.divergence_titre}</p>

          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="provenance">
                <th className="pb-1">{textes.colonne_champ}</th>
                <th className="pb-1 text-right">{textes.colonne_saisi}</th>
                <th className="pb-1 text-right">{textes.colonne_lu}</th>
              </tr>
            </thead>
            <tbody>
              {divergences.map((champ) => (
                <tr className="border-t border-neutral-100" key={champ.champ}>
                  <td className="py-1.5 text-encre">
                    {champsLisibles[champ.champ] ?? champ.champ}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-declare">
                    {formaterValeur(champ.saisi as number, UNITE_PAR_CHAMP[champ.champ])}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-ecart">
                    {formaterValeur(champ.lu as number, UNITE_PAR_CHAMP[champ.champ])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-2 text-sm text-encre">{textes.divergence_aide}</p>
        </div>
      ) : null}

      {/* Le rejet différé enseigne comme le rejet immédiat. */}
      {appelleLeGuide(sort.motif) ? (
        <GuideCapture introduction={libelles.formulaire.guide_capture.apres_rejet} ouvert />
      ) : null}

      {!validee && !enAttente ? (
        <p className="mt-3">
          <Link className="text-sm text-mesure underline underline-offset-2" href="/publier">
            {textes.renvoyer}
          </Link>
        </p>
      ) : null}

      <p className="sr-only">{envoi.id}</p>
    </>
  );
}
