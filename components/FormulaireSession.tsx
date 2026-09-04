"use client";

import Link from "next/link";
import Script from "next/script";
import { useMemo, useState, useSyncExternalStore } from "react";

import libelles from "@/config/libelles.json";
import { formaterValeur } from "@/lib/baremes";
import { calculerSession, horodatagesSession } from "@/lib/calculs-session.ts";
import { analyserDuree } from "@/lib/duree.ts";
import { UNITES } from "@/lib/cles.ts";
import { remplir } from "@/lib/modeles.ts";
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
import { plateformes, vehicules } from "@/lib/enumerations";
import { listeVilles, seuilsSession } from "@/lib/parametres";
import { controlerSession } from "@/lib/validation/regles-session.ts";

import { Champ, Ligne } from "./Champ";

const textes = libelles.formulaire_session;
const motifs = libelles.motifs_session as Record<string, string>;

/** Unité d'affichage de chaque anomalie de session, pour ne rien coder en dur ici. */

const unitesAnomalie: Record<string, string> = {
  duree_sous_minimum: UNITES.minutes,
  duree_sur_maximum: UNITES.minutes,
  cadence_impossible: UNITES.coursesParHeure,
  temps_paye_superieur_au_connecte: UNITES.minutes,
};

const cleTurnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const motifsTechniques: Record<string, string> = {
  ...libelles.motifs_technique,
  ...libelles.motifs_anti_fraude,
  ...libelles.motifs_session,
};
const motifsSoumission: Record<string, string> = libelles.motifs_soumission;
const champsLisibles: Record<string, string> = libelles.champs_soumission;

/** Un détail est soit un code normalisé, soit une erreur de champ. */
const decrireDetail = (detail: unknown): string => {
  if (typeof detail === "string") return motifsTechniques[detail] ?? detail;

  if (detail && typeof detail === "object" && "champ" in detail && "motif" in detail) {
    const { champ, motif } = detail as { champ: string; motif: string };
    return `${champsLisibles[champ] ?? champ} : ${motifsSoumission[motif] ?? motif}`;
  }

  return String(detail);
};

const reinitialiserTurnstile = () => {
  try {
    window.turnstile?.reset();
  } catch {
    /* Script absent ou déjà retiré : le prochain envoi le signalera lui-même. */
  }
};

export default function FormulaireSession() {
  const memoire = useSyncExternalStore(abonnerStockage, lireStockage, stockageAuRendu);
  const dateDuJour = useSyncExternalStore(sansAbonnement, aujourdhui, dateAuRendu);

  const [envoi, setEnvoi] = useState<"repos" | "en_cours">("repos");
  const [envoyee, setEnvoyee] = useState(false);
  const [retourEnvoi, setRetourEnvoi] = useState<{
    reussite: boolean;
    message: string;
  } | null>(null);

  const [contexteSaisi, setContexteSaisi] = useState<Contexte | null>(null);
  const [dateSaisie, setDateSaisie] = useState<string | null>(null);

  const [villeLibre, setVilleLibre] = useState("");
  const [connexion, setConnexion] = useState("");
  const [deconnexion, setDeconnexion] = useState("");
  const [nombreCourses, setNombreCourses] = useState("");
  const [revenu, setRevenu] = useState("");
  const [minutesEnCourse, setMinutesEnCourse] = useState("");

  const contexte = contexteSaisi ?? decoder(memoire);
  const dateSession = dateSaisie ?? dateDuJour;

  const majContexte = (champ: keyof Contexte, valeur: string) => {
    const suivant = { ...contexte, [champ]: valeur };
    setContexteSaisi(suivant);
    ecrireStockage(suivant);
  };

  const session = useMemo(() => {
    const horodatages = horodatagesSession(dateSession, connexion, deconnexion);

    return {
      connexionLe: horodatages?.connexionLe ?? null,
      deconnexionLe: horodatages?.deconnexionLe ?? null,
      nombreCourses: enNombre(nombreCourses),
      revenuPlateformeEuros: enNombre(revenu),
      minutesEnCourse: analyserDuree(minutesEnCourse),
    };
  }, [dateSession, connexion, deconnexion, nombreCourses, revenu, minutesEnCourse]);

  const resultat = useMemo(() => calculerSession(session), [session]);

  const anomalies = useMemo(
    () => (dateSession === "" ? [] : controlerSession(session, seuilsSession(dateSession))),
    [session, dateSession]
  );

  const mettreEnForme = (valeur: number | null, unite: string) =>
    valeur === null ? null : formaterValeur(valeur, unite);

  /* Les grandeurs telles que le livreur les a saisies, pour ecrire le calcul en
     toutes lettres a cote de chaque resultat. */
  const saisi = {
    revenu: mettreEnForme(session.revenuPlateformeEuros, UNITES.euroParCourse),
    duree: mettreEnForme(resultat.dureeConnecteeMinutes, UNITES.minutes),
    en_course: mettreEnForme(session.minutesEnCourse, UNITES.minutes),
    courses: session.nombreCourses === null ? null : String(session.nombreCourses),
    connexion: connexion === "" ? null : connexion,
    deconnexion: deconnexion === "" ? null : deconnexion,
  };

  const rienACalculer = resultat.dureeConnecteeMinutes === null;

  const envoyer = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();

    /*
     * Les champs ne portent pas de `name` : ils sont pilotés par l'état. Le
     * corps est donc assemblé ici, et le jeton anti-robot récupéré du
     * formulaire, où le script de Cloudflare l'a déposé.
     */
    const corpsFormulaire = new FormData(evenement.currentTarget);

    const jeton = corpsFormulaire.get("cf-turnstile-response");
    if (typeof jeton !== "string" || jeton === "") {
      setRetourEnvoi({ reussite: false, message: textes.envoi.turnstile_sans_jeton });
      return;
    }

    for (const [nom, valeur] of [
      ["date_session", dateSession],
      ["ville", contexte.ville],
      ["ville_libre", villeLibre],
      ["plateforme", contexte.plateforme],
      ["vehicule", contexte.vehicule],
      ["heure_connexion", connexion],
      ["heure_deconnexion", deconnexion],
      ["nombre_courses", nombreCourses],
      ["revenu_total_euros", revenu],
      ["minutes_en_course", minutesEnCourse],
    ] as const) {
      corpsFormulaire.append(nom, valeur);
    }

    setEnvoi("en_cours");
    setRetourEnvoi(null);

    try {
      const reponse = await fetch("/api/sessions", {
        method: "POST",
        body: corpsFormulaire,
      });
      const corps = (await reponse.json()) as {
        statut?: string;
        motif?: string;
        details?: unknown;
      };

      const reussite = reponse.ok && corps.statut !== "rejetee_auto";

      const precision = Array.isArray(corps.details)
        ? ` — ${corps.details.map(decrireDetail).join(" ; ")}`
        : "";

      setRetourEnvoi({
        reussite,
        message: reussite
          ? textes.envoi.reussite
          : `${textes.envoi.rejet} ${motifsTechniques[corps.motif ?? ""] ?? corps.motif ?? ""}${precision}`.trim(),
      });

      if (reussite) setEnvoyee(true);
      else reinitialiserTurnstile();
    } catch {
      setRetourEnvoi({ reussite: false, message: textes.envoi.erreur_reseau });
      reinitialiserTurnstile();
    } finally {
      setEnvoi("repos");
    }
  };

  const reprendre = () => {
    setConnexion("");
    setDeconnexion("");
    setNombreCourses("");
    setRevenu("");
    setMinutesEnCourse("");
    setDateSaisie(null);
    setRetourEnvoi(null);
    setEnvoyee(false);
    reinitialiserTurnstile();
  };

  if (envoyee) {
    return (
      <div className="space-y-4">
        <section className="carte border-mesure/40 bg-mesure-clair">
          <h2 className="text-base font-semibold text-mesure">{textes.succes.titre}</h2>
          <p className="mt-2 text-sm text-encre">{textes.succes.explication}</p>
        </section>

        <section className="space-y-3">
          <button className="bouton-principal" onClick={reprendre} type="button">
            {textes.succes.autre}
          </button>
          <p className="provenance">{textes.succes.autre_aide}</p>

          <Link
            className="block text-sm text-mesure underline underline-offset-2"
            href="/statistiques"
          >
            {textes.succes.statistiques}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={envoyer}>
      <section className="carte space-y-4">
        <div>
          <h2 className="etiquette-section">{textes.section_contexte}</h2>
          <p className="text-xs text-neutral-600">{textes.section_contexte_aide}</p>
        </div>

        <Champ identifiant="session-ville" intitule={libelles.formulaire.champs.ville}>
          <select
            className="champ champ-select"
            id="session-ville"
            onChange={(evenement) => majContexte("ville", evenement.target.value)}
            value={contexte.ville}
          >
            <option value="">{libelles.formulaire.choisir}</option>
            {listeVilles.map((ville) => (
              <option key={ville.slug} value={ville.slug}>
                {ville.libelle}
              </option>
            ))}
            <option value={VILLE_AUTRE}>{libelles.formulaire.autre_ville}</option>
          </select>
        </Champ>

        {contexte.ville === VILLE_AUTRE ? (
          <Champ
            identifiant="session-ville-libre"
            intitule={libelles.formulaire.autre_ville_champ}
          >
            <input
              className="champ"
              id="session-ville-libre"
              onChange={(evenement) => setVilleLibre(evenement.target.value)}
              type="text"
              value={villeLibre}
            />
          </Champ>
        ) : null}

        <Champ identifiant="session-plateforme" intitule={libelles.formulaire.champs.plateforme}>
          <select
            className="champ champ-select"
            id="session-plateforme"
            onChange={(evenement) => majContexte("plateforme", evenement.target.value)}
            value={contexte.plateforme}
          >
            <option value="">{libelles.formulaire.choisir}</option>
            {plateformes.map((option) => (
              <option key={option.valeur} value={option.valeur}>
                {option.libelle}
              </option>
            ))}
          </select>
        </Champ>

        <Champ identifiant="session-vehicule" intitule={libelles.formulaire.champs.vehicule}>
          <select
            className="champ champ-select"
            id="session-vehicule"
            onChange={(evenement) => majContexte("vehicule", evenement.target.value)}
            value={contexte.vehicule}
          >
            <option value="">{libelles.formulaire.choisir}</option>
            {vehicules.map((option) => (
              <option key={option.valeur} value={option.valeur}>
                {option.libelle}
              </option>
            ))}
          </select>
        </Champ>
      </section>

      <section className="carte space-y-4">
        <h2 className="etiquette-section">{textes.section_session}</h2>

        <Champ identifiant="date-session" intitule={textes.champs.date_session}>
          <input
            className="champ"
            id="date-session"
            max={dateDuJour}
            onChange={(evenement) => setDateSaisie(evenement.target.value)}
            type="date"
            value={dateSession}
          />
        </Champ>

        <div className="grid grid-cols-2 gap-4">
          <Champ identifiant="connexion" intitule={textes.champs.connexion}>
            <input
              className="champ"
              id="connexion"
              onChange={(evenement) => setConnexion(evenement.target.value)}
              type="time"
              value={connexion}
            />
          </Champ>

          <Champ
            aide={textes.aides.deconnexion}
            identifiant="deconnexion"
            intitule={textes.champs.deconnexion}
          >
            <input
              className="champ"
              id="deconnexion"
              onChange={(evenement) => setDeconnexion(evenement.target.value)}
              type="time"
              value={deconnexion}
            />
          </Champ>

          <Champ identifiant="nombre-courses" intitule={textes.champs.nombre_courses}>
            <input
              className="champ"
              id="nombre-courses"
              inputMode="numeric"
              onChange={(evenement) => setNombreCourses(evenement.target.value)}
              type="text"
              value={nombreCourses}
            />
          </Champ>

          <Champ
            aide={textes.aides.revenu_plateforme}
            identifiant="revenu"
            intitule={textes.champs.revenu_plateforme}
          >
            <input
              className="champ"
              id="revenu"
              inputMode="decimal"
              onChange={(evenement) => setRevenu(evenement.target.value)}
              type="text"
              value={revenu}
            />
          </Champ>
        </div>

        <Champ
          aide={textes.aides.minutes_en_course}
          identifiant="minutes-en-course"
          intitule={textes.champs.minutes_en_course}
        >
          <input
            className="champ"
            id="minutes-en-course"
            inputMode="numeric"
            onChange={(evenement) => setMinutesEnCourse(evenement.target.value)}
            type="text"
            value={minutesEnCourse}
          />
        </Champ>
      </section>

      <div className="space-y-4">
        <section
          aria-live="polite"
          className="carte"
        >
          <h2 className="etiquette-section">{textes.resultats.titre}</h2>

          {rienACalculer ? (
            <p className="mt-2 text-sm text-neutral-600">{textes.resultats.attente}</p>
          ) : (
            <>
              <dl className="mt-2 divide-y divide-neutral-100">
                <Ligne
                  accent
                  calcul={remplir(textes.resultats.calculs.taux_connecte, saisi)}
                  intitule={textes.resultats.taux_connecte}
                  valeur={mettreEnForme(resultat.tauxHoraireConnecte, UNITES.euroParHeure)}
                />
                <Ligne
                  calcul={remplir(textes.resultats.calculs.duree_connectee, saisi)}
                  intitule={textes.resultats.duree_connectee}
                  valeur={mettreEnForme(resultat.dureeConnecteeMinutes, UNITES.minutes)}
                />
                <Ligne
                  intitule={textes.resultats.revenu}
                  valeur={mettreEnForme(
                    session.revenuPlateformeEuros,
                    UNITES.euroParCourse
                  )}
                />
                <Ligne
                  calcul={remplir(textes.resultats.calculs.part_payee, saisi)}
                  intitule={textes.resultats.part_payee}
                  valeur={mettreEnForme(resultat.partPayee, UNITES.pourcent)}
                />
                <Ligne
                  calcul={remplir(textes.resultats.calculs.cadence, saisi)}
                  intitule={textes.resultats.cadence}
                  valeur={mettreEnForme(resultat.coursesParHeure, UNITES.coursesParHeure)}
                />
              </dl>
              <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
                {textes.resultats.precision}
              </p>
            </>
          )}
        </section>

        {anomalies.length > 0 ? (
          <section className="rounded-lg border border-ecart/40 bg-ecart-clair p-4">
            <h2 className="text-sm font-medium text-ecart">{textes.anomalies_titre}</h2>
            <ul className="mt-2 space-y-1.5">
              {anomalies.map((anomalie) => (
                <li key={anomalie.code} className="text-sm text-ecart">
                  {motifs[anomalie.code] ?? anomalie.code} —{" "}
                  {formaterValeur(anomalie.valeur, unitesAnomalie[anomalie.code])} pour une
                  limite de {formaterValeur(anomalie.limite, unitesAnomalie[anomalie.code])}.
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <section className="carte">
        {cleTurnstile ? (
          <>
            <p className="etiquette-section">{textes.envoi.verification}</p>
            <p className="provenance mt-1">{textes.envoi.verification_aide}</p>
            <div className="cf-turnstile mt-2" data-sitekey={cleTurnstile} />
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
            />
          </>
        ) : (
          <p className="rounded-md border border-ecart/40 bg-ecart-clair px-3 py-2 text-sm text-ecart">
            {textes.envoi.turnstile_absent}
          </p>
        )}

        <button
          className="bouton-principal mt-4"
          disabled={!cleTurnstile || envoi === "en_cours"}
          type="submit"
        >
          {envoi === "en_cours" ? textes.envoi.en_cours : textes.envoi.bouton}
        </button>

        {retourEnvoi ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              retourEnvoi.reussite
                ? "border-mesure/40 bg-mesure-clair text-mesure"
                : "border-ecart/40 bg-ecart-clair text-ecart"
            }`}
          >
            {retourEnvoi.message}
          </p>
        ) : null}
      </section>
    </form>
  );
}
