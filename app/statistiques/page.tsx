import type { Metadata } from "next";
import Link from "next/link";

import libelles from "@/config/libelles.json";
import { formaterNombre, formaterValeur } from "@/lib/baremes";
import { UNITES } from "@/lib/cles.ts";
import {
  lireConformite,
  lireDonneesPubliques,
  lireDonneesSessions,
} from "@/lib/donnees.ts";
import { CATEGORIES } from "@/lib/classification.ts";
import { mediane } from "@/lib/statistiques.ts";
import { seuilSessions, seuilsStatistiques } from "@/lib/parametres";
import { etatPublication } from "@/lib/publication.ts";

const textes = libelles.statistiques;

/*
 * Cette page lit la base : elle ne peut pas être figée au moment de la
 * construction. Sans cela, le compteur afficherait éternellement l'état du site
 * au dernier déploiement — c'est-à-dire zéro, sur un site qui promet de publier
 * des chiffres vrais.
 */
export const dynamic = "force-dynamic";

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

  /*
   * LE SQUELETTE EXISTE AVANT LES DONNÉES, ET C'EST VOULU. Un visiteur doit
   * pouvoir lire ce que le site saura dire — les intitulés, les unités, la façon
   * dont les chiffres seront présentés — avant qu'il y ait des chiffres. Un
   * simple compteur ne dit rien de la promesse ; une structure annoncée, si.
   *
   * En revanche, RIEN N'EST INTERROGÉ sous le seuil : ce qui n'est pas publiable
   * n'a pas à traverser le réseau, fût-ce vers une page qui ne l'affichera pas.
   */
  const publiable = etat.mode === "statistiques";

  const conformite = publiable
    ? await lireConformite()
    : { disponible: false, repartition: [], ecarts: [] };

  const seuilDesSessions = seuilSessions(aujourdhui);
  const sessions = await lireDonneesSessions();
  const sessionsPubliables =
    seuilDesSessions !== null && sessions.ratios.length >= seuilDesSessions;

  const effectifParCategorie = new Map(
    conformite.repartition.map((entree) => [entree.categorie, entree.effectif])
  );

  const ecartMedianParCategorie = new Map(
    CATEGORIES.map((categorie) => [
      categorie,
      mediane(
        conformite.ecarts
          .filter((entree) => entree.categorie === categorie)
          .map((entree) => entree.ecart)
      ),
    ])
  );

  const seuilLisible =
    etat.seuil === null ? null : formaterValeur(etat.seuil, UNITES.courses);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{textes.titre}</h1>
      <p className="mt-3 max-w-2xl text-sm text-neutral-700">{textes.introduction}</p>

      <section className="carte-accent mt-8">
        <p className="etiquette-section">
          {textes.compteur_intitule}
        </p>
        <p className="chiffre-principal mt-1">
          {formaterNombre(etat.effectif)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {textes.provenance_compteur
            .replace("{validees}", formaterNombre(etat.effectif))
            .replace("{recues}", formaterNombre(donnees.effectifRecu))}
        </p>

        <p className="mt-4 text-sm text-neutral-700">
          {etat.mode === "aucune_donnee" ? textes.aucune_donnee : null}{" "}
          {seuilLisible === null
            ? null
            : textes.avant_seuil.replace("{seuil}", seuilLisible)}{" "}
          {etat.restantAvantPublication !== null && etat.effectif > 0
            ? textes.restant.replace(
                "{restant}",
                formaterNombre(etat.restantAvantPublication)
              )
            : null}
        </p>

        {etat.seuil === null || etat.seuil === 0 ? null : (
          <div
            aria-hidden="true"
            className="mt-4 flex h-3 w-full overflow-hidden rounded-sm bg-neutral-200"
          >
            <div
              className="bg-mesure"
              style={{ width: `${Math.min(100, (etat.effectif / etat.seuil) * 100)}%` }}
            />
          </div>
        )}

        <p className="mt-2 text-xs text-neutral-500">{textes.provenance_seuil}</p>

        {donnees.requetesDisponibles ? null : (
          <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
            {textes.base_absente}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-neutral-900">
          {textes.conformite.titre}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-700">
          {textes.conformite.introduction}
        </p>

        <div className="carte mt-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="etiquette-section">
                <th className="pb-2" scope="col">{textes.conformite.colonne_categorie}</th>
                <th className="pb-2 text-right" scope="col">
                  {textes.conformite.colonne_effectif}
                </th>
                <th className="pb-2 text-right" scope="col">
                  {textes.conformite.colonne_ecart}
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((categorie) => {
                const effectif = effectifParCategorie.get(categorie);
                const ecart = ecartMedianParCategorie.get(categorie) ?? null;

                return (
                  <tr key={categorie} className="border-t border-neutral-100">
                    <td className="py-2 text-neutral-900">
                      {libelles.categories[categorie as keyof typeof libelles.categories]}
                    </td>
                    <td className="py-2 text-right">
                      {publiable ? (
                        <span className="chiffre">{formaterNombre(effectif ?? 0)}</span>
                      ) : (
                        <span className="provenance">{textes.conformite.attente}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {publiable && ecart !== null ? (
                        <span className="chiffre">
                          {formaterValeur(ecart, UNITES.euroParCourse)}
                        </span>
                      ) : (
                        <span className="provenance">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="provenance mt-3 border-t border-neutral-100 pt-2">
            {textes.conformite.note_ecart}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-neutral-900">{textes.sessions.titre}</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-700">
          {textes.sessions.introduction}
        </p>

        <div className="carte mt-4">
          <p className="etiquette-section">{textes.sessions.intitule_ratio}</p>

          {sessionsPubliables ? (
            <p className="chiffre-principal mt-1">
              {formaterValeur(mediane(sessions.ratios) ?? 0, UNITES.pourcent)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-neutral-700">{textes.sessions.attente}</p>
          )}

          <p className="provenance mt-2">
            {textes.sessions.intitule_effectif} :{" "}
            {formaterNombre(sessions.effectif)}
            {seuilDesSessions === null
              ? null
              : ` / ${formaterValeur(seuilDesSessions, UNITES.sessions)}`}
          </p>

          {sessions.effectif === 0 ? (
            <p className="mt-3 border-t border-neutral-100 pt-2 text-sm text-neutral-700">
              {textes.sessions.aucune_session}
            </p>
          ) : null}

          <p className="provenance mt-2">{textes.sessions.sous_echantillon}</p>
        </div>
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
