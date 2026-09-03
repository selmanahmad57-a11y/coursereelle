"use client";

import Script from "next/script";
import { useMemo, useState, useSyncExternalStore } from "react";

import libelles from "@/config/libelles.json";
import { formaterValeur } from "@/lib/baremes";
import { calculer } from "@/lib/calculs.ts";
import { UNITES } from "@/lib/cles.ts";
import {
  abonnerStockage,
  aujourdhui,
  dateAuRendu,
  decoder,
  ecrireStockage,
  enNombre,
  lireStockage,
  sansAbonnement,
  stockageAuRendu,
  VILLE_AUTRE,
  type Contexte,
} from "@/lib/contexte-livreur.ts";
import { plateformes, vehicules, libelleZone } from "@/lib/enumerations";
import {
  ancienneteMaximale,
  listeVilles,
  seuilsPhysiques,
  tauxCotisations,
  zoneDeLaVille,
} from "@/lib/parametres";
import { controlerCoherencePhysique } from "@/lib/validation/regles-physiques.ts";

import { Champ, classesSaisie } from "./Champ";
import CalculEnDirect from "./CalculEnDirect";
import ChampCapture from "./ChampCapture";

const textes = libelles.formulaire;

/* Les motifs renvoyes par le serveur sont normalises : on les traduit ici plutot
   que d'afficher un identifiant technique a un livreur. */
const motifs: Record<string, string> = {
  ...libelles.motifs_technique,
  ...libelles.motifs_capture,
  ...libelles.motifs_anti_fraude,
  ...libelles.motifs_authenticite,
  ...libelles.motifs_ocr,
};

/*
 * Le script Turnstile expose un objet global. On ne declare que ce qu'on utilise
 * plutot que d'importer une definition complete pour une seule methode.
 */
declare global {
  interface Window {
    turnstile?: { reset: (widget?: string) => void };
  }
}

/*
 * Un jeton Turnstile ne sert qu'une fois. Apres un echec — erreur serveur,
 * capture refusee, champ oublie — le jeton est consomme, et sans cette remise a
 * zero le livreur devrait recharger la page pour reessayer. Les
 * quatre-vingt-dix secondes n'y survivraient pas.
 */
const reinitialiserTurnstile = () => {
  try {
    window.turnstile?.reset();
  } catch {
    /* Script absent ou deja retire : le prochain envoi le signalera lui-meme. */
  }
};

/* Publique par nature : le prefixe NEXT_PUBLIC_ est ce qui autorise son passage
   au navigateur. La cle secrete, elle, ne quitte jamais le serveur. */
const cleTurnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const MILLISECONDES_PAR_JOUR = 86_400_000;

const joursEcoules = (date: string, reference: string): number | null => {
  const depart = Date.parse(`${date}T00:00:00Z`);
  const arrivee = Date.parse(`${reference}T00:00:00Z`);
  if (Number.isNaN(depart) || Number.isNaN(arrivee)) return null;
  return Math.round((arrivee - depart) / MILLISECONDES_PAR_JOUR);
};

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

  const [envoi, setEnvoi] = useState<"repos" | "en_cours">("repos");
  const [retourEnvoi, setRetourEnvoi] = useState<{
    reussite: boolean;
    message: string;
  } | null>(null);

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

  const taux = dateCourse === "" ? null : tauxCotisations(dateCourse);

  const resultat = useMemo(() => calculer(course, taux), [course, taux]);

  const anomalies = useMemo(() => {
    if (dateCourse === "") return [];
    return controlerCoherencePhysique(
      course,
      seuilsPhysiques(dateCourse, contexte.vehicule === "" ? null : contexte.vehicule)
    );
  }, [course, dateCourse, contexte.vehicule]);

  const envoyer = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();

    const formulaire = new FormData(evenement.currentTarget);

    /* Le contrôle du navigateur ne protège rien : celui du serveur fait foi.
       Celui-ci n'existe que pour éviter un aller-retour inutile. */
    const capture = formulaire.get("capture");
    if (!(capture instanceof File) || capture.size === 0) {
      setRetourEnvoi({ reussite: false, message: textes.envoi.capture_requise });
      return;
    }

    /*
     * Le jeton anti-robot est produit par un script tiers. S'il manque, c'est
     * que le script ne s'est pas exécuté — un bloqueur, une coupure — et non que
     * la vérification a échoué. Le dire ici évite de laisser croire à un refus.
     */
    const jeton = formulaire.get("cf-turnstile-response");
    if (typeof jeton !== "string" || jeton === "") {
      setRetourEnvoi({ reussite: false, message: textes.envoi.turnstile_sans_jeton });
      return;
    }

    setEnvoi("en_cours");
    setRetourEnvoi(null);

    try {
      const reponse = await fetch("/api/courses", { method: "POST", body: formulaire });
      const corps = (await reponse.json()) as {
        statut?: string;
        motif?: string;
        details?: unknown;
      };

      const reussite = reponse.ok && corps.statut !== "rejetee_auto";

      /* Le motif est normalisé : l'afficher tel quel permet de dire précisément
         quel filtre a parlé, plutôt qu'un « échec » sans information. */
      const precision = Array.isArray(corps.details) ? ` (${corps.details.join(", ")})` : "";

      setRetourEnvoi({
        reussite,
        message: reussite
          ? textes.envoi.reussite
          : `${textes.envoi.rejet} ${motifs[corps.motif ?? ""] ?? corps.motif ?? ""}${precision}`.trim(),
      });

      /* Le jeton vient d'etre consomme : sans nouvelle validation, le prochain
         essai echouerait pour une raison sans rapport avec la premiere. */
      if (!reussite) reinitialiserTurnstile();
    } catch {
      setRetourEnvoi({ reussite: false, message: textes.envoi.erreur_reseau });
      reinitialiserTurnstile();
    } finally {
      setEnvoi("repos");
    }
  };

  const limiteAnciennete = dateDuJour === "" ? null : ancienneteMaximale(dateDuJour);
  const anciennete = joursEcoules(dateCourse, dateDuJour);
  const tropAncienne =
    limiteAnciennete !== null && anciennete !== null && anciennete > limiteAnciennete;

  return (
    <form className="space-y-8" onSubmit={envoyer}>
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{textes.section_contexte}</h2>
          <p className="text-xs text-neutral-600">{textes.section_contexte_aide}</p>
        </div>

        <Champ identifiant="ville" intitule={textes.champs.ville}>
          <select
            className={classesSaisie}
            id="ville"
            name="ville"
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
            name="ville_libre"
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
            name="plateforme"
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
            name="vehicule"
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
            name="date_course"
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
            name="distance_km"
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
            name="prix_paye_euros"
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
            name="duree_estimee_minutes"
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
            name="duree_reelle_minutes"
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
            name="pourboire_euros"
            inputMode="decimal"
            onChange={(evenement) => setPourboire(evenement.target.value)}
            type="text"
            value={pourboire}
          />
        </Champ>
      </section>

      {dateCourse === "" ? null : (
        <section>
          <ChampCapture dateCourse={dateCourse} />
        </section>
      )}

      <CalculEnDirect
        anomalies={anomalies}
        course={course}
        resultat={resultat}
        tauxCotisations={taux}
      />

      <section>
        {cleTurnstile ? (
          <>
            <p className="text-xs font-medium text-neutral-700">
              {textes.envoi.verification}
            </p>
            <p className="text-xs text-neutral-600">{textes.envoi.verification_aide}</p>
            <div className="cf-turnstile mt-2" data-sitekey={cleTurnstile} />
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
            />
          </>
        ) : (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {textes.envoi.turnstile_absent}
          </p>
        )}

        <button
          className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:bg-neutral-300 disabled:text-neutral-600"
          disabled={!cleTurnstile || envoi === "en_cours"}
          type="submit"
        >
          {envoi === "en_cours" ? textes.envoi.en_cours : textes.envoi.bouton}
        </button>

        {retourEnvoi ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              retourEnvoi.reussite
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {retourEnvoi.message}
          </p>
        ) : null}
      </section>
    </form>
  );
}
