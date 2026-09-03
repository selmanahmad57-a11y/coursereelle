import type { Metadata } from "next";

import libelles from "@/config/libelles.json";
import FormulaireSession from "@/components/FormulaireSession";
import { granulariteMaximale } from "@/lib/parametres";

export const metadata: Metadata = {
  title: libelles.formulaire_session.titre,
  description:
    "Publiez une session de connexion : le site calcule ce que rapporte une heure connectée, attente comprise.",
};

export default function PageSession() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">
        {libelles.formulaire_session.titre}
      </h1>
      <p className="mt-3 text-sm text-neutral-700">
        {libelles.formulaire_session.introduction}
      </p>

      <p className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
        {libelles.formulaire_session.sans_capture} {granulariteMaximale.regle}
      </p>

      <div className="mt-8">
        <FormulaireSession />
      </div>
    </main>
  );
}
