import type { Metadata } from "next";
import Link from "next/link";

import libelles from "@/config/libelles.json";
import { formaterNombre, formaterValeur } from "@/lib/baremes";
import { UNITES } from "@/lib/cles.ts";
import { lireDonneesPubliques } from "@/lib/donnees.ts";
import { seuilsStatistiques } from "@/lib/parametres";
import { etatPublication } from "@/lib/publication.ts";

const textes = libelles.statistiques;

export const metadata: Metadata = {
  title: textes.titre,
  description:
    "Les courses vérifiées, résumées par des médianes. Rien n'est publié avant le seuil de courses.",
};

export default async function PageStatistiques() {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const seuils = seuilsStatistiques(aujourdhui);

  const donnees = await lireDonneesPubliques();
  const etat = etatPublication(donnees.tauxHorairesPlateforme, seuils);

  const seuilLisible =
    etat.seuil === null ? null : formaterValeur(etat.seuil, UNITES.courses);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{textes.titre}</h1>
      <p className="mt-3 max-w-2xl text-sm text-neutral-700">{textes.introduction}</p>

      <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-600">{textes.compteur_intitule}</p>
        <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-neutral-900">
          {formaterNombre(etat.effectif)}
        </p>

        <p className="mt-4 text-sm text-neutral-700">
          {etat.mode === "aucune_donnee" ? textes.aucune_donnee : null}{" "}
          {seuilLisible === null
            ? null
            : textes.avant_seuil.replace("{seuil}", seuilLisible)}{" "}
          {etat.restantAvantPublication !== null && etat.effectif > 0
            ? textes.restant.replace(
                "{restant}",
                formaterValeur(etat.restantAvantPublication, UNITES.courses)
              )
            : null}
        </p>

        {donnees.requetesDisponibles ? null : (
          <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
            {textes.base_absente}
          </p>
        )}
      </section>

      <p className="mt-6 max-w-2xl text-sm text-neutral-700">{textes.pourquoi}</p>

      <p className="mt-6 text-sm">
        <Link className="underline underline-offset-2" href="/methode">
          Comment ces chiffres seront calculés
        </Link>
      </p>
    </main>
  );
}
