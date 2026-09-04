import type { Metadata } from "next";

import libelles from "@/config/libelles.json";
import ListeEnvois from "@/components/ListeEnvois";

const textes = libelles.envois;

export const metadata: Metadata = {
  title: textes.titre,
  description:
    "Le sort des courses envoyées depuis cet appareil : validées, en attente de lecture, ou refusées avec leur motif.",
};

export default function PageEnvois() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold text-encre">{textes.titre}</h1>
      <p className="mt-3 max-w-2xl text-sm text-encre">{textes.introduction}</p>

      <ListeEnvois />

      <p className="provenance mt-8 max-w-2xl">{textes.limite}</p>
    </main>
  );
}
