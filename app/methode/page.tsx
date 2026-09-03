import type { Metadata } from "next";

import {
  baremes,
  decrirePortee,
  etatSource,
  familles,
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

export const metadata: Metadata = {
  title: "Méthode",
  description:
    "Toutes les règles de validation et toutes les valeurs utilisées par Course Réelle, publiées intégralement.",
};

type Entree = RegleAnnoncee | RegleLegale | ParametreSysteme;

const couleursEtat: Record<ReturnType<typeof etatSource>, string> = {
  verifiee: "bg-emerald-50 text-emerald-900 ring-emerald-600/20",
  citee: "bg-amber-50 text-amber-900 ring-amber-600/20",
  absente: "bg-neutral-100 text-neutral-700 ring-neutral-500/20",
};

function Provenance({ source }: { source: Source }) {
  const etat = etatSource(source);

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3 text-xs">
      <span
        className={`inline-block rounded px-2 py-0.5 font-medium ring-1 ring-inset ${couleursEtat[etat]}`}
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
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium text-neutral-900">{entree.libelle}</h3>
        <span className="font-mono text-lg font-semibold tabular-nums text-neutral-900">
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
        <p className="mt-2 border-l-2 border-amber-300 pl-3 text-xs text-neutral-700">
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

export default function PageMethode() {
  const grilles = grouperParGrille(baremes.regles_annoncees);

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
