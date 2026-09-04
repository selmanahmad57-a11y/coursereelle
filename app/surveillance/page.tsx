import type { Metadata } from "next";
import { cookies } from "next/headers";

import libelles from "@/config/libelles.json";
import { formaterNombre, formaterValeur } from "@/lib/baremes";
import { aujourdhui } from "@/lib/contexte-livreur.ts";
import { UNITES } from "@/lib/cles.ts";
import { parametreSysteme } from "@/lib/parametres";
import { resumerRemplissage } from "@/lib/remplissage.ts";
import { CLES_SYSTEME } from "@/lib/cles.ts";
import { lireSurveillance, type EtatSurveillance } from "@/lib/surveillance-db.ts";
import { accesAutorise, jetonAcces, NOM_COOKIE } from "@/lib/surveillance.ts";

import { ouvrirSurveillance } from "./actions";

const textes = libelles.surveillance;

export const metadata: Metadata = {
  title: textes.titre,
  robots: { index: false, follow: false },
};

const compteurs = (etat: EtatSurveillance) =>
  [
    { cle: "statuts", entrees: etat.statuts, table: "statuts", vide: textes.vide },
    { cle: "rejets", entrees: etat.rejets, table: "motifsRejet", vide: textes.aucun_rejet },
    {
      cle: "signalements",
      entrees: etat.signalements,
      table: "signalements",
      vide: textes.aucun_signalement,
    },
    {
      cle: "types_capture",
      entrees: etat.typesCapture,
      table: "types_capture",
      vide: textes.vide,
    },
    {
      cle: "lectures",
      entrees: etat.lectures,
      table: "statuts_lecture",
      vide: textes.vide,
    },
    {
      cle: "captures",
      entrees: etat.captures,
      table: "captures_compteurs",
      vide: textes.vide,
    },
    {
      cle: "anti_fraude",
      entrees: etat.antiFraude,
      table: "anti_fraude_compteurs",
      vide: textes.vide,
    },
  ] as const;

const tables = libelles as unknown as Record<string, Record<string, unknown>>;

/*
 * Un motif de rejet peut venir de n'importe quel filtre. Le tableau lit donc
 * toutes les familles : un code affiche sans libelle serait un motif orphelin,
 * et c'est exactement ce que la surveillance doit rendre visible.
 */
const FAMILLES_MOTIFS = [
  "anomalies",
  "motifs_capture",
  "motifs_ocr",
  "motifs_authenticite",
  "motifs_session",
  "motifs_anti_fraude",
];

const enTexte = (valeur: unknown): string | null => {
  if (typeof valeur === "string") return valeur;
  if (valeur && typeof valeur === "object" && "libelle" in valeur) {
    return String((valeur as { libelle: unknown }).libelle);
  }
  return null;
};

const libelleMotifRejet = (code: string): string => {
  for (const famille of FAMILLES_MOTIFS) {
    const trouve = enTexte(tables[famille]?.[code]);
    if (trouve) return trouve;
  }
  return code;
};

const intituler = (table: string, code: string): string => {
  if (table === "motifsRejet") return libelleMotifRejet(code);
  /* « prixEuros : verifie » -> « Prix payé par la plateforme — Vérifié sur la capture ». */
  if (table === "statuts_lecture") {
    const [champ, statut] = code.split(" : ");
    const nomChamp =
      enTexte(tables.champs_lecture?.[champ]) ?? champ;
    const nomStatut = enTexte(tables.statuts_lecture?.[statut]) ?? statut;
    return `${nomChamp} — ${nomStatut}`;
  }
  if (table === "captures_compteurs") {
    return (
      enTexte(textes.captures_compteurs[code as keyof typeof textes.captures_compteurs]) ?? code
    );
  }
  if (table === "anti_fraude_compteurs") {
    return enTexte(textes.anti_fraude_compteurs[code as keyof typeof textes.anti_fraude_compteurs]) ?? code;
  }
  return enTexte(tables[table]?.[code]) ?? code;
};

function Compteurs({
  table,
  entrees,
  vide,
}: {
  table: string;
  entrees: readonly { cle: string; nombre: number }[];
  vide: string;
}) {
  if (entrees.length === 0) {
    return <p className="text-sm text-neutral-600">{vide}</p>;
  }

  return (
    <ul className="divide-y divide-neutral-100">
      {entrees.map((entree) => (
        <li key={entree.cle} className="flex items-baseline justify-between gap-4 py-1.5">
          <span className="text-sm text-neutral-700">{intituler(table, entree.cle)}</span>
          <span className="font-mono text-sm font-medium tabular-nums text-neutral-900">
            {formaterNombre(entree.nombre)}
          </span>
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

  const etat = await lireSurveillance();

  const objectif = parametreSysteme(CLES_SYSTEME.objectifTempsRemplissage, aujourdhui());
  const resumes = resumerRemplissage(etat.remplissages, objectif);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{textes.titre}</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-700">{textes.sous_titre}</p>

      {etat.base ? null : (
        <p className="mt-4 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700">
          {textes.base_absente}
        </p>
      )}

      {compteurs(etat).map((groupe) => (
        <section key={groupe.cle} className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900">
            {textes.sections[groupe.cle]}
          </h2>
          <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-4">
            <Compteurs entrees={groupe.entrees} table={groupe.table} vide={groupe.vide} />
            {groupe.cle === "lectures" ? (
              <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
                {textes.lectures_note}
              </p>
            ) : null}
            {groupe.cle === "captures" ? (
              <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
                {textes.captures_note}
              </p>
            ) : null}
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
          {textes.remplissage.titre}
        </h2>
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-4">
          {resumes.length === 0 ? (
            <p className="text-sm text-neutral-600">{textes.remplissage.vide}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-medium text-neutral-600">
                  <th className="pb-1" scope="col">{textes.remplissage.colonne_appareil}</th>
                  <th className="pb-1 text-right" scope="col">
                    {textes.remplissage.colonne_effectif}
                  </th>
                  <th className="pb-1 text-right" scope="col">
                    {textes.remplissage.colonne_mediane}
                  </th>
                  <th className="pb-1 text-right" scope="col">
                    {textes.remplissage.colonne_part}
                  </th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((resume) => (
                  <tr key={resume.appareil} className="border-t border-neutral-100">
                    <td className="py-1.5 text-neutral-900">
                      {libelles.appareils[resume.appareil as keyof typeof libelles.appareils] ??
                        resume.appareil}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-neutral-700">
                      {formaterNombre(resume.effectif)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-neutral-900">
                      {resume.mediane === null
                        ? "—"
                        : formaterValeur(resume.mediane, UNITES.secondes)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-neutral-900">
                      {resume.partSousObjectif === null
                        ? "—"
                        : formaterValeur(resume.partSousObjectif, UNITES.pourcent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {objectif === null ? null : (
            <p className="mt-3 text-xs font-medium text-neutral-800">
              {textes.remplissage.objectif.replace(
                "{objectif}",
                formaterValeur(objectif, UNITES.secondes)
              )}
            </p>
          )}

          <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
            {textes.remplissage.note}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">
          {textes.sections.villes_libres}
        </h2>
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-4">
          {etat.villesLibres.length === 0 ? (
            <p className="text-sm text-neutral-600">{textes.vide}</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {etat.villesLibres.map((ville) => (
                <li
                  key={ville.saisie}
                  className="flex items-baseline justify-between gap-4 py-1.5"
                >
                  <span className="text-sm text-neutral-700">{ville.saisie}</span>
                  <span className="font-mono text-sm tabular-nums text-neutral-900">
                    {formaterNombre(ville.nombre)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
