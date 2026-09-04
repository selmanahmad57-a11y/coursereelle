import type { Metadata } from "next";
import Link from "next/link";

import libelles from "@/config/libelles.json";
import { formaterNombre, formaterValeur } from "@/lib/baremes";
import { calculer } from "@/lib/calculs.ts";
import { classer } from "@/lib/classification.ts";
import { UNITES } from "@/lib/cles.ts";
import { lireCoursesPubliees, lireDonneesPubliques, type CoursePubliee } from "@/lib/donnees.ts";
import {
  reglagesListeCourses,
  reglesClassification,
  seuilsStatistiques,
  tauxCotisations,
  villeParSlug,
} from "@/lib/parametres";
import { etatPublication } from "@/lib/publication.ts";
import { remplacer } from "@/lib/textes.ts";
import { aujourdhui } from "@/lib/contexte-livreur.ts";

const textes = libelles.courses;

/* La liste lit la base : figée à la construction, elle montrerait le corpus tel
   qu'il était au dernier déploiement. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: textes.titre,
  description:
    "Toutes les courses vérifiées, sans résumé ni moyenne : la liste brute, de la plus récente à la plus ancienne.",
};

const traduire = (table: Record<string, string>, cle: string): string => table[cle] ?? cle;

/** Le premier entier utilisable d'un paramètre d'URL, sinon la première page. */
const numeroDePage = (brut: string | string[] | undefined): number => {
  const valeur = Number(Array.isArray(brut) ? brut[0] : brut);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : 1;
};

function Verification({ course }: { course: CoursePubliee }) {
  const statuts = Object.entries(course.statutsLecture);
  const nonVerifies = statuts.filter(([, statut]) => statut !== "verifie");

  return (
    <>
      <span
        /* Le rouge est réservé aux écarts contre une annonce. Une vérification
           partielle n'est pas une faute du livreur : c'est une limite de notre
           lecture, et elle se dit en gris. */
        className={nonVerifies.length === 0 ? "puce-mesure" : "puce-declare"}
      >
        {nonVerifies.length === 0 ? textes.badge_complete : textes.badge_partielle}
      </span>

      {nonVerifies.length === 0 ? null : (
        <ul className="mt-1.5 space-y-0.5">
          {nonVerifies.map(([champ, statut]) => (
            <li key={champ} className="text-xs text-neutral-600">
              {traduire(libelles.champs_lecture, champ)} —{" "}
              {traduire(libelles.statuts_lecture, statut)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Conformite({ course }: { course: CoursePubliee }) {
  const classements = classer(
    {
      prixEuros: course.prixEuros,
      distanceKm: course.distanceKm,
      dureeEstimeeMinutes: course.dureeEstimeeMinutes,
    },
    reglesClassification(course.dateCourse, {
      plateforme: course.plateforme,
      zone: course.zone,
      vehicule: course.vehicule,
    })
  );

  return (
    <ul className="space-y-1.5">
      {classements.map((classement) => (
        <li key={classement.categorie}>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
              classement.categorie === "conforme"
                ? "bg-neutral-100 text-neutral-700 ring-neutral-500/20"
                : "bg-ecart-clair text-ecart ring-ecart/30"
            }`}
          >
            {traduire(libelles.categories, classement.categorie)}
          </span>

          {classement.valeurBareme === null ||
          classement.valeurConstatee === null ||
          classement.unite === null ? null : (
            <span className="mt-1 block font-mono text-xs tabular-nums text-neutral-600">
              {remplacer(textes.detail_categorie, {
                bareme: formaterValeur(classement.valeurBareme, classement.unite),
                constate: formaterValeur(classement.valeurConstatee, classement.unite),
              })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Une course en fiche : la même information que la ligne, empilée. */
function Fiche({ course }: { course: CoursePubliee }) {
  const ville = villeParSlug(course.villeSlug);

  const resultat = calculer(
    {
      prixPaye: course.prixEuros,
      pourboire: null,
      distanceKm: course.distanceKm,
      dureeReelleMinutes: course.dureeReelleMinutes,
      dureeEstimeeMinutes: course.dureeEstimeeMinutes,
    },
    tauxCotisations(course.dateCourse)
  );

  return (
    <li className="carte">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-neutral-900">
          {ville === null ? libelles.formulaire.autre_ville : ville.libelle}
        </span>
        <span className="font-mono text-xs tabular-nums text-neutral-500">
          {course.dateCourse}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-neutral-600">
        {traduire(libelles.plateformes, course.plateforme)} ·{" "}
        {traduire(libelles.vehicules, course.vehicule)}
      </p>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-neutral-600">{textes.colonnes.taux}</p>
          <p className="bandeau-chiffre">
            {resultat.tauxPlateforme === null
              ? "—"
              : formaterValeur(resultat.tauxPlateforme, UNITES.euroParHeure)}
          </p>
        </div>
        <p className="text-right font-mono text-xs tabular-nums text-neutral-700">
          {formaterValeur(course.prixEuros, UNITES.euroParCourse)}
          <br />
          {formaterValeur(course.distanceKm, UNITES.kilometre)}
        </p>
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <Conformite course={course} />
      </div>

      <div className="mt-3">
        <Verification course={course} />
      </div>
    </li>
  );
}

function Ligne({ course }: { course: CoursePubliee }) {
  const ville = villeParSlug(course.villeSlug);

  const resultat = calculer(
    {
      prixPaye: course.prixEuros,
      pourboire: null,
      distanceKm: course.distanceKm,
      dureeReelleMinutes: course.dureeReelleMinutes,
      dureeEstimeeMinutes: course.dureeEstimeeMinutes,
    },
    tauxCotisations(course.dateCourse)
  );

  return (
    <tr className="border-t border-neutral-200 align-top">
      <td className="px-3 py-3 whitespace-nowrap tabular-nums text-neutral-700">
        {course.dateCourse}
      </td>
      <td className="px-3 py-3 text-neutral-900">
        {ville === null ? libelles.formulaire.autre_ville : ville.libelle}
      </td>
      <td className="px-3 py-3 text-neutral-700">
        {traduire(libelles.plateformes, course.plateforme)}
      </td>
      <td className="px-3 py-3 text-neutral-700">
        {traduire(libelles.vehicules, course.vehicule)}
      </td>
      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap text-neutral-900">
        {formaterValeur(course.distanceKm, UNITES.kilometre)}
      </td>
      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap text-neutral-900">
        {formaterValeur(course.prixEuros, UNITES.euroParCourse)}
      </td>
      <td className="px-3 py-3 text-right font-mono font-medium tabular-nums whitespace-nowrap text-neutral-900">
        {resultat.tauxPlateforme === null
          ? "—"
          : formaterValeur(resultat.tauxPlateforme, UNITES.euroParHeure)}
      </td>
      <td className="px-3 py-3">
        <Conformite course={course} />
      </td>
      <td className="px-3 py-3">
        <Verification course={course} />
      </td>
    </tr>
  );
}

export default async function PageCourses({ searchParams }: PageProps<"/courses">) {
  const parametres = await searchParams;
  const page = numeroDePage(parametres.page);
  const parPage = reglagesListeCourses.par_page;

  const [liste, donnees] = await Promise.all([
    lireCoursesPubliees({ page, parPage }),
    lireDonneesPubliques(),
  ]);

  /*
   * Le compteur passe par le même calcul que l'accueil et la page Statistiques.
   * Trois pages affichant trois comptes différents seraient la dissonance qu'un
   * lecteur attentif transforme en soupçon. Les deux chiffres comptent
   * aujourd'hui la même chose — les courses validées — et le resteront : quand
   * le filtre statistique écartera une course, il lui donnera le statut
   * `hors_distribution`, qui la retire aussi de cette liste.
   */
  const etat = etatPublication(donnees.tauxHorairesPlateforme, seuilsStatistiques(aujourdhui()));

  const pages = Math.max(1, Math.ceil(liste.total / parPage));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">{textes.titre}</h1>
      <p className="mt-3 max-w-2xl text-sm text-neutral-700">{textes.introduction}</p>

      <p className="bandeau mt-6">
        <span className="bandeau-chiffre">
          {formaterNombre(etat.effectif)}
        </span>
        <span>{textes.compteur_intitule}</span>
      </p>

      {liste.courses.length === 0 ? (
        <p className="mt-8 max-w-2xl rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          {liste.disponible ? textes.aucune : textes.base_absente}
        </p>
      ) : (
        <>
          {/*
            * SUR TÉLÉPHONE, LE TABLEAU MENT PAR OMISSION. Neuf colonnes tiennent
            * sur soixante-quatre rem ; un écran de trottoir en montre quatre. Le
            * prix, le taux, la conformité et la vérification — c'est-à-dire tout
            * ce que cette page existe pour montrer — sortaient du cadre, sans
            * qu'aucun signe n'indique qu'on pouvait faire défiler.
            *
            * Chaque course devient donc une fiche empilée en dessous de 640 px,
            * et redevient une ligne de registre au-dessus.
            */}
          <ul className="mt-6 space-y-3 sm:hidden">
            {liste.courses.map((course) => (
              <Fiche key={course.id} course={course} />
            ))}
          </ul>

          <div className="mt-8 hidden overflow-x-auto rounded-lg border border-neutral-200 bg-white sm:block">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead>
                <tr className="text-xs font-medium text-neutral-600">
                  <th className="px-3 py-2" scope="col">{textes.colonnes.date}</th>
                  <th className="px-3 py-2" scope="col">{textes.colonnes.ville}</th>
                  <th className="px-3 py-2" scope="col">{textes.colonnes.plateforme}</th>
                  <th className="px-3 py-2" scope="col">{textes.colonnes.vehicule}</th>
                  <th className="px-3 py-2 text-right" scope="col">{textes.colonnes.distance}</th>
                  <th className="px-3 py-2 text-right" scope="col">{textes.colonnes.prix}</th>
                  <th className="px-3 py-2 text-right" scope="col">{textes.colonnes.taux}</th>
                  <th className="px-3 py-2" scope="col">{textes.colonnes.categorie}</th>
                  <th className="px-3 py-2" scope="col">{textes.colonnes.verification}</th>
                </tr>
              </thead>
              <tbody>
                {liste.courses.map((course) => (
                  <Ligne key={course.id} course={course} />
                ))}
              </tbody>
            </table>
          </div>

          <nav className="mt-4 flex flex-wrap items-center gap-4" aria-label="Pagination">
            {page > 1 ? (
              <Link
                className="text-sm text-neutral-900 underline underline-offset-2"
                href={`/courses?page=${page - 1}`}
              >
                {textes.pagination.precedente}
              </Link>
            ) : null}

            <span className="text-sm text-neutral-600">
              {remplacer(textes.pagination.position, {
                page: formaterNombre(page),
                pages: formaterNombre(pages),
              })}
            </span>

            {page < pages ? (
              <Link
                className="text-sm text-neutral-900 underline underline-offset-2"
                href={`/courses?page=${page + 1}`}
              >
                {textes.pagination.suivante}
              </Link>
            ) : null}
          </nav>
        </>
      )}

      <p className="mt-8 max-w-2xl text-sm text-neutral-600">{textes.ordre}</p>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">{textes.granularite}</p>

      <p className="mt-6 text-sm">
        <Link className="text-neutral-900 underline underline-offset-2" href="/statistiques">
          Les chiffres agrégés, et pourquoi ils ne sont pas ici
        </Link>
      </p>
    </main>
  );
}
