"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import libelles from "@/config/libelles.json";
import { formaterValeur } from "@/lib/baremes";
import { calculer } from "@/lib/calculs.ts";
import { UNITES } from "@/lib/cles.ts";
import { plateformes, vehicules, libelleZone } from "@/lib/enumerations";
import {
  ancienneteMaximale,
  listeVilles,
  seuilsPhysiques,
  tauxCotisations,
  zoneDeLaVille,
} from "@/lib/parametres";
import { controlerCoherencePhysique } from "@/lib/validation/regles-physiques.ts";

import CalculEnDirect from "./CalculEnDirect";

const textes = libelles.formulaire;

/** Ce que l'appareil retient d'une visite à l'autre : les champs qui ne changent pas. */
const CLE_MEMOIRE = "coursereelle.contexte";
const VILLE_AUTRE = "autre";

interface Contexte {
  ville: string;
  plateforme: string;
  vehicule: string;
}

const CONTEXTE_VIDE: Contexte = { ville: "", plateforme: "", vehicule: "" };

const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Sources extérieures à React : le stockage local et l'horloge         */
/* ------------------------------------------------------------------ */

/*
 * On s'abonne à ces deux sources plutôt que de les recopier dans un état depuis
 * un effet : le rendu serveur ne connaît ni la mémoire ni la date du visiteur,
 * et une recopie après montage provoquerait un rendu en cascade.
 */

const abonnerStockage = (rappel: () => void) => {
  window.addEventListener("storage", rappel);
  return () => window.removeEventListener("storage", rappel);
};

const lireStockage = (): string | null => {
  try {
    return window.localStorage.getItem(CLE_MEMOIRE);
  } catch {
    return null;
  }
};

const stockageAuRendu = (): string | null => null;

const ecrireStockage = (contexte: Contexte) => {
  try {
    window.localStorage.setItem(CLE_MEMOIRE, JSON.stringify(contexte));
  } catch {
    /* Écriture refusée (navigation privée, réglage du navigateur) : sans conséquence. */
  }
};

const decoder = (brut: string | null): Contexte => {
  if (!brut) return CONTEXTE_VIDE;
  try {
    return { ...CONTEXTE_VIDE, ...(JSON.parse(brut) as Partial<Contexte>) };
  } catch {
    return CONTEXTE_VIDE;
  }
};

const sansAbonnement = () => () => {};
const dateAuRendu = (): string => "";

/* ------------------------------------------------------------------ */

/** Les livreurs saisissent « 12,2 » aussi souvent que « 12.2 ». */
const enNombre = (saisie: string): number | null => {
  const nettoye = saisie.replace(",", ".").trim();
  if (nettoye === "") return null;
  const valeur = Number(nettoye);
  return Number.isFinite(valeur) ? valeur : null;
};

const MILLISECONDES_PAR_JOUR = 86_400_000;

const joursEcoules = (date: string, reference: string): number | null => {
  const depart = Date.parse(`${date}T00:00:00Z`);
  const arrivee = Date.parse(`${reference}T00:00:00Z`);
  if (Number.isNaN(depart) || Number.isNaN(arrivee)) return null;
  return Math.round((arrivee - depart) / MILLISECONDES_PAR_JOUR);
};

function Champ({
  identifiant,
  intitule,
  aide,
  children,
}: {
  identifiant: string;
  intitule: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-800" htmlFor={identifiant}>
        {intitule}
      </label>
      {children}
      {aide ? <p className="mt-1 text-xs text-neutral-600">{aide}</p> : null}
    </div>
  );
}

const classesSaisie =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 focus:border-neutral-900 focus:outline-none";

export default function FormulaireCourse() {
  const memoire = useSyncExternalStore(abonnerStockage, lireStockage, stockageAuRendu);
  const dateDuJour = useSyncExternalStore(sansAbonnement, aujourdhui, dateAuRendu);

  const [contexteSaisi, setContexteSaisi] = useState<Contexte | null>(null);
  const [dateSaisie, setDateSaisie] = useState<string | null>(null);
  const [autreVille, setAutreVille] = useState("");

  const [distance, setDistance] = useState("");
  const [prixPaye, setPrixPaye] = useState("");
  const [pourboire, setPourboire] = useState("");
  const [dureeEstimee, setDureeEstimee] = useState("");
  const [dureeReelle, setDureeReelle] = useState("");

  const contexte = contexteSaisi ?? decoder(memoire);
  const dateCourse = dateSaisie ?? dateDuJour;

  const majContexte = (champ: keyof Contexte, valeur: string) => {
    const suivant = { ...contexte, [champ]: valeur };
    setContexteSaisi(suivant);
    ecrireStockage(suivant);
  };

  const zone = contexte.ville === VILLE_AUTRE ? null : zoneDeLaVille(contexte.ville);

  const course = useMemo(
    () => ({
      prixPaye: enNombre(prixPaye),
      pourboire: enNombre(pourboire),
      distanceKm: enNombre(distance),
      dureeReelleMinutes: enNombre(dureeReelle),
      dureeEstimeeMinutes: enNombre(dureeEstimee),
    }),
    [prixPaye, pourboire, distance, dureeReelle, dureeEstimee]
  );

  const resultat = useMemo(
    () => calculer(course, dateCourse === "" ? null : tauxCotisations(dateCourse)),
    [course, dateCourse]
  );

  const anomalies = useMemo(() => {
    if (dateCourse === "") return [];
    return controlerCoherencePhysique(
      course,
      seuilsPhysiques(dateCourse, contexte.vehicule === "" ? null : contexte.vehicule)
    );
  }, [course, dateCourse, contexte.vehicule]);

  const limiteAnciennete = dateDuJour === "" ? null : ancienneteMaximale(dateDuJour);
  const anciennete = joursEcoules(dateCourse, dateDuJour);
  const tropAncienne =
    limiteAnciennete !== null && anciennete !== null && anciennete > limiteAnciennete;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{textes.section_contexte}</h2>
          <p className="text-xs text-neutral-600">{textes.section_contexte_aide}</p>
        </div>

        <Champ identifiant="ville" intitule={textes.champs.ville}>
          <select
            className={classesSaisie}
            id="ville"
            onChange={(evenement) => majContexte("ville", evenement.target.value)}
            value={contexte.ville}
          >
            <option value="">{textes.choisir}</option>
            {listeVilles.map((ville) => (
              <option key={ville.slug} value={ville.slug}>
                {ville.libelle}
              </option>
            ))}
            <option value={VILLE_AUTRE}>{textes.autre_ville}</option>
          </select>
        </Champ>

        {contexte.ville === VILLE_AUTRE ? (
          <Champ identifiant="autre-ville" intitule={textes.autre_ville_champ}>
            <input
              className={classesSaisie}
              id="autre-ville"
              onChange={(evenement) => setAutreVille(evenement.target.value)}
              type="text"
              value={autreVille}
            />
          </Champ>
        ) : null}

        {contexte.ville !== "" ? (
          <p className="text-xs text-neutral-600">
            {zone === null
              ? textes.zone_inconnue
              : `${textes.zone_deduite} : ${libelleZone(zone)}`}
          </p>
        ) : null}

        <Champ identifiant="plateforme" intitule={textes.champs.plateforme}>
          <select
            className={classesSaisie}
            id="plateforme"
            onChange={(evenement) => majContexte("plateforme", evenement.target.value)}
            value={contexte.plateforme}
          >
            <option value="">{textes.choisir}</option>
            {plateformes.map((option) => (
              <option key={option.valeur} value={option.valeur}>
                {option.libelle}
              </option>
            ))}
          </select>
        </Champ>

        <Champ identifiant="vehicule" intitule={textes.champs.vehicule}>
          <select
            className={classesSaisie}
            id="vehicule"
            onChange={(evenement) => majContexte("vehicule", evenement.target.value)}
            value={contexte.vehicule}
          >
            <option value="">{textes.choisir}</option>
            {vehicules.map((option) => (
              <option key={option.valeur} value={option.valeur}>
                {option.libelle}
              </option>
            ))}
          </select>
        </Champ>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-neutral-900">{textes.section_course}</h2>

        <Champ identifiant="date-course" intitule={textes.champs.date_course}>
          <input
            className={classesSaisie}
            id="date-course"
            max={dateDuJour}
            onChange={(evenement) => setDateSaisie(evenement.target.value)}
            type="date"
            value={dateCourse}
          />
        </Champ>

        {tropAncienne && limiteAnciennete !== null ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {textes.anciennete_depassee.replace(
              "{limite}",
              formaterValeur(limiteAnciennete, UNITES.jours)
            )}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Champ identifiant="distance" intitule={textes.champs.distance_km}>
            <input
              className={classesSaisie}
              id="distance"
              inputMode="decimal"
              onChange={(evenement) => setDistance(evenement.target.value)}
              type="text"
              value={distance}
            />
          </Champ>

          <Champ identifiant="prix-paye" intitule={textes.champs.prix_paye}>
            <input
              className={classesSaisie}
              id="prix-paye"
              inputMode="decimal"
              onChange={(evenement) => setPrixPaye(evenement.target.value)}
              type="text"
              value={prixPaye}
            />
          </Champ>

          <Champ identifiant="duree-estimee" intitule={textes.champs.duree_estimee}>
            <input
              className={classesSaisie}
              id="duree-estimee"
              inputMode="numeric"
              onChange={(evenement) => setDureeEstimee(evenement.target.value)}
              type="text"
              value={dureeEstimee}
            />
          </Champ>

          <Champ
            aide={textes.aides.duree_reelle}
            identifiant="duree-reelle"
            intitule={textes.champs.duree_reelle}
          >
            <input
              className={classesSaisie}
              id="duree-reelle"
              inputMode="numeric"
              onChange={(evenement) => setDureeReelle(evenement.target.value)}
              type="text"
              value={dureeReelle}
            />
          </Champ>
        </div>

        <Champ
          aide={textes.aides.pourboire}
          identifiant="pourboire"
          intitule={textes.champs.pourboire}
        >
          <input
            className={classesSaisie}
            id="pourboire"
            inputMode="decimal"
            onChange={(evenement) => setPourboire(evenement.target.value)}
            type="text"
            value={pourboire}
          />
        </Champ>
      </section>

      <CalculEnDirect anomalies={anomalies} resultat={resultat} />

      <section>
        <button
          className="w-full rounded-md bg-neutral-300 px-4 py-3 text-base font-medium text-neutral-600"
          disabled
          type="button"
        >
          {textes.envoi.bouton}
        </button>
        <p className="mt-2 text-xs text-neutral-600">{textes.envoi.indisponible}</p>
      </section>
    </div>
  );
}
