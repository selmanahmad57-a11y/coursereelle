import type { Metadata } from "next";

import libelles from "@/config/libelles.json";
import FormulaireCourse from "@/components/FormulaireCourse";
import { granulariteMaximale } from "@/lib/parametres";

export const metadata: Metadata = {
  title: libelles.formulaire.titre,
  description:
    "Publiez une course réelle : le site calcule votre taux horaire vécu et le compare à ce que l'application laisse croire.",
};

export default function PagePublier() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{libelles.formulaire.titre}</h1>
      <p className="mt-3 text-sm text-neutral-700">{libelles.formulaire.introduction}</p>

      <p className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
        {granulariteMaximale.regle}
      </p>

      <div className="mt-8">
        <FormulaireCourse />
      </div>
    </main>
  );
}
