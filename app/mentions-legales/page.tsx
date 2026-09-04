import type { Metadata } from "next";
import Link from "next/link";

import mentions from "@/config/mentions-legales.json";

import { valeursDesJetons } from "@/lib/parametres";
import { remplacer } from "@/lib/textes.ts";
import { aujourdhui } from "@/lib/contexte-livreur.ts";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Éditeur, hébergeur, stockage des données dans l'Union européenne, et traitement des données personnelles.",
};

function Source({ source }: { source: { libelle: string; url: string } | null }) {
  if (source === null) return null;

  return (
    <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
      <a
        className="underline underline-offset-2 hover:text-neutral-900"
        href={source.url}
        rel="noreferrer"
        target="_blank"
      >
        {source.libelle}
      </a>
    </p>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-neutral-900">{titre}</h2>
      <div className="carte mt-3">{children}</div>
    </section>
  );
}

export default function PageMentionsLegales() {
  const valeurs = valeursDesJetons(aujourdhui());

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{mentions.titre}</h1>

      <Bloc titre={mentions.editeur.titre}>
        <p className="text-sm font-medium text-neutral-900">{mentions.editeur.regime}</p>

        {mentions.editeur.texte.map((paragraphe) => (
          <p key={paragraphe.slice(0, 40)} className="mt-3 text-sm text-neutral-700">
            {paragraphe}
          </p>
        ))}

        <p className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-700">
          <a
            className="font-medium text-neutral-900 underline underline-offset-2"
            href={`mailto:${mentions.editeur.contact}`}
          >
            {mentions.editeur.contact}
          </a>
        </p>
        <p className="mt-1 text-sm text-neutral-600">{mentions.editeur.contact_texte}</p>
      </Bloc>

      <Bloc titre={mentions.hebergeur.titre}>
        <p className="text-sm font-medium text-neutral-900">{mentions.hebergeur.denomination}</p>
        <p className="mt-1 text-sm text-neutral-700">{mentions.hebergeur.adresse}</p>
        <p className="mt-2 text-sm text-neutral-600">{mentions.hebergeur.role}</p>
        <Source source={mentions.hebergeur.source} />
      </Bloc>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-neutral-900">{mentions.stockage.titre}</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-700">{mentions.stockage.chapeau}</p>

        <ul className="mt-3 space-y-3">
          {mentions.stockage.liste.map((prestataire) => (
            <li
              key={prestataire.denomination}
              className="carte"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-medium text-neutral-900">
                  {prestataire.denomination}
                </h3>
                <span className="text-xs font-medium text-neutral-800">
                  {prestataire.localisation}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-700">{prestataire.role}</p>
              <Source source={prestataire.source} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-neutral-900">
          {mentions.confidentialite.titre}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-700">
          {mentions.confidentialite.chapeau}
        </p>

        <ul className="mt-3 space-y-3">
          {mentions.confidentialite.points.map((point) => (
            <li key={point.titre} className="carte">
              <h3 className="text-sm font-medium text-neutral-900">{point.titre}</h3>
              <p className="mt-2 text-sm text-neutral-700">{remplacer(point.texte, valeurs)}</p>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-sm">
          <Link className="text-neutral-900 underline underline-offset-2" href="/methode">
            Toutes les valeurs appliquées sont publiées sur la page Méthode
          </Link>
        </p>
      </section>

      <Bloc titre={mentions.licence.titre}>
        <p className="text-sm font-medium text-neutral-900">
          <a
            className="underline underline-offset-2"
            href={mentions.licence.url}
            rel="noreferrer"
            target="_blank"
          >
            {mentions.licence.nom}
          </a>
        </p>
        <p className="mt-2 text-sm text-neutral-700">{mentions.licence.texte}</p>
      </Bloc>

      <Bloc titre={mentions.contenu.titre}>
        {mentions.contenu.texte.map((paragraphe) => (
          <p key={paragraphe.slice(0, 40)} className="text-sm text-neutral-700 [&:not(:first-child)]:mt-3">
            {paragraphe}
          </p>
        ))}
      </Bloc>

      <p className="mt-10 text-xs text-neutral-600">
        Dernière mise à jour : {mentions.mise_a_jour}
      </p>
    </main>
  );
}
