import type { Metadata } from "next";

import libelles from "@/config/libelles.json";

import {
  delaiSuppressionCaptureHeures,
  granulariteMaximale,
  interpretationZone,
  valeursDesJetons,
} from "@/lib/parametres";
import { remplacer } from "@/lib/textes.ts";
import { aujourdhui } from "@/lib/contexte-livreur.ts";
import { etatCaptures } from "@/lib/entretien.ts";
import {
  baremes,
  decrirePortee,
  etatSource,
  familles,
  formaterNombre,
  formaterPeriode,
  formaterValeur,
  grouperParGrille,
  libelleEtatSource,
  libelleUsage,
  type ParametreSysteme,
  type RegleAnnoncee,
  type RegleLegale,
  type Source,
} from "@/lib/baremes";

/*
 * Cette page publie un compteur vivant : celui des captures au-delà de leur
 * délai. Figé à la construction, il afficherait éternellement l'état du dernier
 * déploiement — c'est-à-dire zéro, sur la page même qui en fait une preuve.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Méthode",
  description:
    "Toutes les règles de validation et toutes les valeurs utilisées par Course Réelle, publiées intégralement.",
};

type Entree = RegleAnnoncee | RegleLegale | ParametreSysteme;

/* Trois natures, trois puces : prouvé, déclaré, manquant. */
const couleursEtat: Record<ReturnType<typeof etatSource>, string> = {
  verifiee: "puce-mesure",
  citee: "puce-declare",
  absente: "puce-ecart",
};

function Provenance({ source }: { source: Source }) {
  const etat = etatSource(source);

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3 text-xs">
      <span
        className={couleursEtat[etat]}
      >
        {libelleEtatSource(etat)}
      </span>
      <p className="mt-1.5 text-neutral-600">
        {source.url ? (
          <a
            className="underline underline-offset-2 hover:text-neutral-900"
            href={source.url}
            rel="noreferrer"
            target="_blank"
          >
            {source.libelle}
          </a>
        ) : (
          source.libelle
        )}
      </p>
    </div>
  );
}

function Carte({ entree }: { entree: Entree }) {
  const portee = decrirePortee(entree);
  const source = "source" in entree ? entree.source : null;
  const explication =
    "definition" in entree
      ? entree.definition
      : "justification" in entree
        ? entree.justification
        : null;

  return (
    <li className="carte">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium text-neutral-900">{entree.libelle}</h3>
        <span className="font-mono text-lg font-semibold tabular-nums text-mesure">
          {formaterValeur(entree.valeur, entree.unite)}
        </span>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {portee ? (
          <div>
            <dt className="sr-only">Portée</dt>
            <dd>{portee}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">Période</dt>
          <dd>{formaterPeriode(entree.valable_du, entree.valable_au)}</dd>
        </div>
        <div>
          <dt className="sr-only">Usage</dt>
          <dd className="font-medium text-neutral-800">{libelleUsage(entree.usage)}</dd>
        </div>
      </dl>

      {entree.precision_date ? (
        <p className="mt-2 border-l-2 border-ecart/40 pl-3 text-xs text-neutral-700">
          {entree.precision_date}
        </p>
      ) : null}

      {explication ? <p className="mt-2 text-sm text-neutral-700">{explication}</p> : null}

      {entree.note ? <p className="mt-2 text-sm text-neutral-600">{entree.note}</p> : null}

      {source ? <Provenance source={source} /> : null}
    </li>
  );
}

function Section({
  titre,
  description,
  children,
}: {
  titre: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold text-neutral-900">{titre}</h2>
      <p className="mt-2 max-w-2xl text-sm text-neutral-700">{description}</p>
      {children}
    </section>
  );
}

export default async function PageMethode() {
  const grilles = grouperParGrille(baremes.regles_annoncees);

  const etatDesCaptures = await etatCaptures(
    new Date(),
    delaiSuppressionCaptureHeures(aujourdhui())
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Méthode</h1>

      <p className="mt-3 max-w-2xl text-sm text-neutral-700">
        Cette page n&apos;est pas une déclaration d&apos;intention : elle affiche la configuration
        que le site utilise réellement pour valider et classer les courses. Chaque valeur y figure
        avec sa période de validité et sa provenance. Modifier une règle sans modifier cette page
        est impossible — c&apos;est le même fichier.
      </p>

      <p className="mt-3 max-w-2xl text-sm text-neutral-700">
        Les périodes sont bornes incluses. Une valeur sans date de fin est en vigueur ; une valeur
        sans date de début est appliquée depuis une date que nous n&apos;avons pas encore établie, et
        le dit explicitement plutôt que d&apos;afficher une date fausse. Une course est toujours
        jugée selon les règles en vigueur à sa date, jamais selon les règles d&apos;aujourd&apos;hui.
      </p>

      <section className="mt-10 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-neutral-900">
          {libelles.methode.pourboire.titre}
        </h2>
        <p className="mt-2 text-sm text-neutral-700">{libelles.methode.pourboire.texte}</p>
        <p className="mt-2 text-sm text-neutral-600">
          {libelles.methode.pourboire.contrepartie}
        </p>
      </section>

      <Section
        titre={familles.regles_annoncees.titre}
        description={familles.regles_annoncees.description}
      >
        {[...grilles.values()].map((groupe) => (
          <ul key={groupe[0].groupe ?? groupe[0].cle} className="mt-4 space-y-3">
            {groupe.map((regle) => (
              <Carte
                key={`${regle.cle}-${regle.zone ?? ""}-${regle.valable_du ?? ""}`}
                entree={regle}
              />
            ))}
          </ul>
        ))}
      </Section>

      <Section
        titre={familles.regles_legales.titre}
        description={familles.regles_legales.description}
      >
        <ul className="mt-4 space-y-3">
          {baremes.regles_legales.map((regle) => (
            <Carte key={regle.cle} entree={regle} />
          ))}
        </ul>
      </Section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-neutral-900">
          {libelles.methode.verification.titre}
        </h2>
        <div className="carte mt-4">
          <p className="text-sm font-medium text-neutral-900">
            {libelles.methode.verification.texte}
          </p>
          <p className="mt-3 text-sm text-neutral-700">
            {libelles.methode.verification.declaratif}
          </p>
          <p className="mt-3 border-t border-neutral-200 pt-3 text-sm text-neutral-700">
            {libelles.methode.verification.consequence}
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-neutral-900">
          {libelles.methode.sous_echantillons.titre}
        </h2>
        <div className="carte mt-4">
          <p className="text-sm text-neutral-700">{libelles.methode.sous_echantillons.texte}</p>
          <p className="mt-3 text-sm text-neutral-700">
            {libelles.methode.sous_echantillons.consequence}
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-neutral-900">
          {libelles.methode.donnees_invisibles.titre}
        </h2>
        <div className="carte mt-4">
          <p className="text-sm text-neutral-700">
            {libelles.methode.donnees_invisibles.texte}
          </p>
          <p className="mt-3 text-sm text-neutral-700">
            {libelles.methode.donnees_invisibles.defense}
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-neutral-900">
          {libelles.methode.authenticite.titre}
        </h2>
        <div className="carte-accent mt-4">
          <p className="text-sm font-medium text-neutral-900">
            {libelles.methode.authenticite.aveu}
          </p>
          <p className="mt-3 text-sm text-neutral-700">
            {libelles.methode.authenticite.controles}
          </p>
          <p className="mt-3 text-sm text-neutral-700">
            {libelles.methode.authenticite.protection}
          </p>
          <p className="mt-3 border-t border-neutral-200 pt-3 text-sm font-medium text-neutral-900">
            {libelles.methode.authenticite.conclusion}
          </p>
        </div>

        <div className="carte mt-3">
          <h3 className="text-sm font-medium text-neutral-900">
            {libelles.methode.calibrage.titre}
          </h3>
          <p className="mt-2 text-sm text-neutral-700">{libelles.methode.calibrage.texte}</p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-neutral-900">
          {libelles.methode.choix_editoriaux.titre}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-700">
          {libelles.methode.choix_editoriaux.chapeau}
        </p>

        <div className="mt-4 space-y-3">
          {libelles.methode.choix_editoriaux.points.map((point) => (
            <div
              key={point.titre}
              className="carte"
            >
              <h3 className="text-sm font-medium text-neutral-900">{point.titre}</h3>
              <p className="mt-2 text-sm text-neutral-700">{point.texte}</p>
              <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm font-medium text-neutral-900">
                {point.consequence}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-neutral-900">Ce que nous ne collectons pas</h2>
        <div className="mt-4 space-y-3">
          <div className="carte">
            <h3 className="text-sm font-medium text-neutral-900">
              {granulariteMaximale.libelle}
            </h3>
            <p className="mt-2 text-sm text-neutral-700">{granulariteMaximale.regle}</p>
            <p className="mt-2 text-sm text-neutral-600">{granulariteMaximale.portee}</p>
          </div>

          <div className="carte">
            <h3 className="text-sm font-medium text-neutral-900">
              {libelles.methode.captures.titre}
            </h3>
            <p className="mt-2 text-sm text-neutral-700">{libelles.methode.captures.texte}</p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {remplacer(libelles.methode.captures.regle, valeursDesJetons(aujourdhui()))}
            </p>
            <p className="mt-2 text-sm text-neutral-700">{libelles.methode.captures.reste}</p>
            <p className="mt-2 text-sm text-neutral-700">
              {libelles.methode.captures.traitement}
            </p>

            <p className="mt-2 border-t border-neutral-200 pt-2 text-sm text-neutral-700">
              {libelles.methode.captures.controle}
            </p>

            <div className="carte-accent mt-3">
              <p className="etiquette-section">
                {libelles.methode.captures.compteur_intitule}
              </p>

              {etatDesCaptures === null ? (
                <p className="mt-1 text-sm text-neutral-700">
                  {libelles.methode.captures.compteur_indisponible}
                </p>
              ) : (
                <>
                  <p
                    /* Zéro est ici un bon état, prouvé : il porte la couleur de
                       la donnée. Tout autre nombre est un écart, et le dit. */
                    className={`mt-0.5 font-mono text-4xl font-semibold tabular-nums ${
                      etatDesCaptures.echues === 0 ? "text-mesure" : "text-ecart"
                    }`}
                  >
                    {formaterNombre(etatDesCaptures.echues)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {libelles.methode.captures.compteur_detail
                      .replace("{dans_le_delai}", formaterNombre(etatDesCaptures.dans_le_delai))
                      .replace("{supprimees}", formaterNombre(etatDesCaptures.supprimees))}
                  </p>
                </>
              )}

              <p className="mt-2 text-xs text-neutral-600">
                {libelles.methode.captures.compteur_regle}
              </p>
            </div>
          </div>

          <div className="carte">
            <h3 className="text-sm font-medium text-neutral-900">
              {libelles.methode.remplissage.titre}
            </h3>
            <p className="mt-2 text-sm text-neutral-700">
              {remplacer(libelles.methode.remplissage.texte, valeursDesJetons(aujourdhui()))}
            </p>
            <p className="mt-2 text-sm text-neutral-700">
              {remplacer(libelles.methode.remplissage.portee, valeursDesJetons(aujourdhui()))}
            </p>
            <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm text-neutral-700">
              {libelles.methode.remplissage.consequence}
            </p>
          </div>

          <div className="carte">
            <h3 className="text-sm font-medium text-neutral-900">
              {libelles.methode.anti_fraude.titre}
            </h3>
            <p className="mt-2 text-sm text-neutral-700">
              {libelles.methode.anti_fraude.texte}
            </p>
            <p className="mt-2 text-sm text-neutral-700">
              {libelles.methode.anti_fraude.consequence}
            </p>
            <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm text-neutral-600">
              {libelles.methode.anti_fraude.limite}
            </p>
          </div>

          <div className="carte">
            <h3 className="text-sm font-medium text-neutral-900">
              {interpretationZone.libelle}
            </h3>
            <p className="mt-2 text-sm text-neutral-700">{interpretationZone.regle}</p>
            <p className="mt-2 border-l-2 border-ecart/40 pl-3 text-sm text-neutral-700">
              {interpretationZone.incertitude}
            </p>
            <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
              {interpretationZone.source.libelle}
            </p>
          </div>
        </div>
      </section>

      <Section
        titre={familles.parametres_systeme.titre}
        description={familles.parametres_systeme.description}
      >
        <ul className="mt-4 space-y-3">
          {baremes.parametres_systeme.map((parametre) => (
            <Carte
              key={`${parametre.cle}-${parametre.vehicule ?? ""}`}
              entree={parametre}
            />
          ))}
        </ul>
      </Section>
    </main>
  );
}
