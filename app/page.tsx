import type { Metadata } from "next";
import Link from "next/link";

import libelles from "@/config/libelles.json";
import BarresComparees from "@/components/BarresComparees";
import { formaterNombre, formaterValeur } from "@/lib/baremes";
import { calculer, ecartRelatif } from "@/lib/calculs.ts";
import { enDeca } from "@/lib/comparaison.ts";
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
  const barres = textes.vitrine.barres;

  return (
    <>
      <BarresComparees
        lignes={[
          {
            cle: "mesure",
            libelle: barres.mesure,
            valeur: resultat.tauxPlateforme,
            lisible:
              resultat.tauxPlateforme === null
                ? "—"
                : formaterValeur(resultat.tauxPlateforme, UNITES.euroParHeure),
            provenance: remplacer(textes.vitrine.provenance_taux, {
              prix: formaterValeur(course.prixEuros, UNITES.euroParCourse),
              duree: formaterValeur(course.dureeReelleMinutes, UNITES.minutes),
            }),
            mesuree: true,
            alerte: enDeca(resultat.tauxPlateforme, garantie),
          },
          {
            cle: "annonce",
            libelle: barres.annonce,
            valeur: garantie,
            lisible: garantie === null ? "—" : formaterValeur(garantie, UNITES.euroParHeure),
            provenance: textes.vitrine.provenance_garantie,
            mesuree: false,
            /* L'annonce ne porte jamais l'alerte : c'est elle qui sert de repère. */
            alerte: false,
          },
        ]}
        libelleManque={
          ecart === null
            ? barres.manque
            : `${barres.manque} ${formaterValeur(ecart, UNITES.pourcent)}`
        }
        legende={barres.legende}
      />

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

      <p className="mt-2 text-xs text-neutral-500">
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
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Le compteur d'abord : ce que le site a vérifié se lit avant ce qu'il affirme. */}
      <Link
        className="bandeau transition-colors hover:bg-mesure-clair"
        href="/statistiques"
      >
        <span className="bandeau-chiffre">
          {formaterNombre(etat.effectif)}
        </span>
        <span>
          {remplacer(textes.compteur.chapeau, {
            validees: formaterNombre(etat.effectif),
            recues: formaterNombre(donnees.effectifRecu),
          })}
        </span>
      </Link>

      <h1 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-neutral-900">
        {textes.titre}
      </h1>
      <p className="mt-4 max-w-2xl text-sm text-neutral-700">{textes.chapeau}</p>

      <section className="carte-accent mt-8">
        <h2 className="etiquette-section">
          {textes.vitrine.titre}
        </h2>

        {course === null ? (
          <p className="mt-4 text-sm text-neutral-700">{textes.vitrine.aucune}</p>
        ) : (
          <Vitrine course={course} />
        )}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {textes.actions.map((action) => (
          <Link
            key={action.href}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-mesure"
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
