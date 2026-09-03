import type { Metadata } from "next";
import Link from "next/link";

import libelles from "@/config/libelles.json";

import { valeursDesJetons } from "@/lib/parametres";
import { remplacer } from "@/lib/textes.ts";
import { aujourdhui } from "@/lib/contexte-livreur.ts";

export const metadata: Metadata = {
  title: "Questions fréquentes",
  description:
    "Ce que devient votre capture, ce que le site collecte, ce qu'il publie, et qui l'édite.",
};

export default function PageFaq() {
  const valeurs = valeursDesJetons(aujourdhui());
  const { faq } = libelles;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{faq.titre}</h1>

      <p className="mt-3 max-w-2xl text-sm text-neutral-700">{faq.chapeau}</p>

      <nav aria-label="Sommaire" className="mt-8 rounded-lg border border-neutral-200 bg-white p-4">
        <ul className="space-y-1.5">
          {faq.questions.map((entree) => (
            <li key={entree.cle}>
              <a
                className="text-sm text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
                href={`#${entree.cle}`}
              >
                {entree.question}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 space-y-8">
        {faq.questions.map((entree) => (
          <section key={entree.cle} id={entree.cle} className="scroll-mt-6">
            <h2 className="text-lg font-semibold text-neutral-900">{entree.question}</h2>

            {entree.reponse.map((paragraphe) => (
              <p key={paragraphe.slice(0, 40)} className="mt-3 text-sm text-neutral-700">
                {remplacer(paragraphe, valeurs)}
              </p>
            ))}

            {entree.renvoi ? (
              <p className="mt-3 text-sm">
                <Link
                  className="text-neutral-900 underline underline-offset-2"
                  href={entree.renvoi.href}
                >
                  {entree.renvoi.libelle}
                </Link>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
