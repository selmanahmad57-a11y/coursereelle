import type { Metadata } from "next";
import Link from "next/link";

import libelles from "@/config/libelles.json";
import { formaterNombre, formaterValeur } from "@/lib/baremes";
import { calculer, ecartRelatif } from "@/lib/calculs.ts";
import { CLES_ANNONCEES, UNITES } from "@/lib/cles.ts";
import {
  lireDerniereCourseVerifiee,
  lireDonneesPubliques,
  type CourseVerifiee,
} from "@/lib/donnees.ts";
import { regleAnnoncee, seuilsStatistiques, tauxCotisations } from "@/lib/parametres";
import { etatPublication } from "@/lib/publication.ts";
import { remplacer } from "@/lib/textes.ts";
import { aujourdhui } from "@/lib/contexte-livreur.ts";

const textes = libelles.accueil;

/*
 * L'accueil lit la base : figé à la construction, son compteur afficherait
 * éternellement l'état du site au dernier déploiement, et sa course vérifiée
 * serait celle d'un autre jour. Sur un site dont le seul argument est
 * l'exactitude, un chiffre périmé coûte plus cher qu'un chiffre lent.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Course Réelle",
  description:
    "Les courses réelles des livreurs, vérifiées automatiquement par leur propre capture, pour mesurer l'écart entre les annonces des plateformes et la réalité du terrain.",
};

function Chiffre({
  intitule,
  valeur,
  provenance,
  accent = false,
}: {
  intitule: string;
  valeur: string;
  provenance: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-neutral-600">{intitule}</p>
      <p
        className={`mt-0.5 font-mono font-semibold tabular-nums text-neutral-900 ${
          accent ? "text-4xl" : "text-2xl"
        }`}
      >
        {valeur}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{provenance}</p>
    </div>
  );
}

function Vitrine({ course }: { course: CourseVerifiee }) {
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

  const garantie = regleAnnoncee(CLES_ANNONCEES.garantieHoraire, course.dateCourse, {
    plateforme: course.plateforme,
  });

  const ecart = ecartRelatif(resultat.tauxPlateforme, garantie);

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {resultat.tauxPlateforme === null ? null : (
          <Chiffre
            accent
            intitule={textes.vitrine.intitule_taux}
            valeur={formaterValeur(resultat.tauxPlateforme, UNITES.euroParHeure)}
            provenance={remplacer(textes.vitrine.provenance_taux, {
              prix: formaterValeur(course.prixEuros, UNITES.euroParCourse),
              duree: formaterValeur(course.dureeReelleMinutes, UNITES.minutes),
            })}
          />
        )}

        {garantie === null ? null : (
          <Chiffre
            accent
            intitule={textes.vitrine.intitule_garantie}
            valeur={formaterValeur(garantie, UNITES.euroParHeure)}
            provenance={textes.vitrine.provenance_garantie}
          />
        )}
      </div>

      {ecart === null ? null : (
        <p className="mt-6 border-t border-neutral-200 pt-4 text-sm text-neutral-800">
          {remplacer(textes.vitrine.provenance_ecart, {
            ecart: formaterValeur(ecart, UNITES.pourcent),
          })}
        </p>
      )}

      {garantie === null ? (
        <p className="mt-6 border-t border-neutral-200 pt-4 text-sm text-neutral-700">
          {textes.vitrine.sans_garantie}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-neutral-500">
        {remplacer(textes.vitrine.provenance_distance, {
          distance: formaterValeur(course.distanceKm, UNITES.kilometre),
        })}
      </p>

      <p className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-700">
        {textes.vitrine.preuve}
      </p>
      <p className="mt-2 text-xs text-neutral-500">{textes.vitrine.selection}</p>
    </>
  );
}

export default async function Accueil() {
  const [course, donnees] = await Promise.all([
    lireDerniereCourseVerifiee(),
    lireDonneesPubliques(),
  ]);

  /* Le compteur passe par le même calcul que la page Statistiques. Le compter
     ici à part donnerait deux chiffres pour une seule vérité, et c'est
     précisément ce qu'un site de vérification ne peut pas se permettre. */
  const etat = etatPublication(
    donnees.tauxHorairesPlateforme,
    seuilsStatistiques(aujourdhui())
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-neutral-900">
        {textes.titre}
      </h1>
      <p className="mt-4 max-w-2xl text-sm text-neutral-700">{textes.chapeau}</p>

      <section className="mt-10 rounded-lg border border-neutral-300 bg-white p-6">
        <h2 className="text-sm font-medium text-neutral-900">{textes.vitrine.titre}</h2>

        <div className="mt-5">
          {course === null ? (
            <p className="text-sm text-neutral-700">{textes.vitrine.aucune}</p>
          ) : (
            <Vitrine course={course} />
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-600">{textes.compteur.intitule}</p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-neutral-900">
          {formaterNombre(etat.effectif)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {libelles.statistiques.provenance_compteur
            .replace("{validees}", formaterNombre(etat.effectif))
            .replace("{recues}", formaterNombre(donnees.effectifRecu))}
        </p>
        <p className="mt-3 text-sm">
          <Link className="text-neutral-900 underline underline-offset-2" href="/statistiques">
            {textes.compteur.lien}
          </Link>
        </p>
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {textes.actions.map((action) => (
          <Link
            key={action.href}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-400"
            href={action.href}
          >
            <span className="text-sm font-medium text-neutral-900">{action.libelle}</span>
            <span className="mt-2 block text-xs text-neutral-600">{action.description}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
