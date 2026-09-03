import type { Metadata } from "next";
import { cookies } from "next/headers";

import libelles from "@/config/libelles.json";
import { baseConfiguree } from "@/lib/donnees.ts";
import { accesAutorise, jetonAcces, NOM_COOKIE } from "@/lib/surveillance.ts";

import { ouvrirSurveillance } from "./actions";

const textes = libelles.surveillance;

export const metadata: Metadata = {
  title: textes.titre,
  robots: { index: false, follow: false },
};

const groupes = [
  { cle: "rejets", tables: ["motifs_capture", "motifs_ocr", "motifs_authenticite", "motifs_session"] },
  { cle: "signalements", tables: ["signalements"] },
  { cle: "anti_fraude", tables: ["motifs_anti_fraude"] },
] as const;

const tables = libelles as unknown as Record<string, Record<string, string>>;

function Compteurs({ table }: { table: string }) {
  const entrees = Object.entries(tables[table] ?? {});

  return (
    <ul className="mt-2 divide-y divide-neutral-100">
      {entrees.map(([code, intitule]) => (
        <li key={code} className="flex items-baseline justify-between gap-4 py-1.5">
          <span className="text-sm text-neutral-700">{intitule}</span>
          <span className="font-mono text-sm tabular-nums text-neutral-500">0</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PageSurveillance({
  searchParams,
}: PageProps<"/surveillance">) {
  const parametres = await searchParams;
  const attendu = process.env.SURVEILLANCE_PASSWORD;

  const jar = await cookies();
  const jeton = jar.get(NOM_COOKIE)?.value ?? null;
  const attenduJeton = attendu ? await jetonAcces(attendu) : undefined;
  const ouvert = accesAutorise(jeton, attenduJeton);

  if (!ouvert) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-xl font-semibold text-neutral-900">{textes.titre}</h1>

        {attendu ? (
          <form action={ouvrirSurveillance} className="mt-6">
            <label
              className="block text-sm font-medium text-neutral-800"
              htmlFor="motdepasse"
            >
              {textes.acces.intitule}
            </label>
            <input
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 focus:border-neutral-900 focus:outline-none"
              id="motdepasse"
              name="motdepasse"
              type="password"
            />
            <button
              className="mt-3 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              {textes.acces.bouton}
            </button>
            {parametres?.refus ? (
              <p className="mt-3 text-sm text-amber-800">{textes.acces.refus}</p>
            ) : null}
          </form>
        ) : (
          <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {textes.acces.non_configure}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{textes.titre}</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-700">{textes.sous_titre}</p>

      {baseConfiguree() ? null : (
        <p className="mt-4 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700">
          {textes.base_absente}
        </p>
      )}

      {groupes.map((groupe) => (
        <section key={groupe.cle} className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900">
            {textes.sections[groupe.cle]}
          </h2>
          <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-4">
            {groupe.tables.map((table) => (
              <Compteurs key={table} table={table} />
            ))}
            {groupe.cle === "anti_fraude" ? (
              <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
                {textes.anti_fraude_note}
              </p>
            ) : null}
          </div>
        </section>
      ))}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">
          {textes.sections.villes_libres}
        </h2>
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-600">{textes.vide}</p>
        </div>
      </section>
    </main>
  );
}
