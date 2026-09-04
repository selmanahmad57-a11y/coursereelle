"use client";

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

export default function FormulaireSession() {
  const memoire = useSyncExternalStore(abonnerStockage, lireStockage, stockageAuRendu);
  const dateDuJour = useSyncExternalStore(sansAbonnement, aujourdhui, dateAuRendu);

  const [contexteSaisi, setContexteSaisi] = useState<Contexte | null>(null);
  const [dateSaisie, setDateSaisie] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
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

      <section>
        <button
          className="bouton-principal"
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
