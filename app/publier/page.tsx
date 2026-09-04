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
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{libelles.formulaire.titre}</h1>
      <p className="mt-2 text-sm text-neutral-700">{libelles.formulaire.introduction}</p>

      <p className="mt-3 border-l-4 border-mesure bg-white py-2 pr-3 pl-3 text-xs text-neutral-700">
        {granulariteMaximale.regle}
      </p>

      <div className="mt-5">
        <FormulaireCourse />
      </div>
    </main>
  );
}
