"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import libelles from "@/config/libelles.json";
import { formaterValeur } from "@/lib/baremes";
import { calculer } from "@/lib/calculs.ts";
import { analyserDuree } from "@/lib/duree.ts";
import { APPAREILS, UNITES } from "@/lib/cles.ts";
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
import { appelleLeGuide } from "@/lib/motifs-guide.ts";

import {
  BROUILLON_VIDE,
  brouillonAuRendu,
  brouillonRempli,
  decoderBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  type Brouillon,
} from "@/lib/brouillon.ts";

import reglagesInterface from "@/config/interface.json";
import {
  ajouterEnvoi,
  decoderEnvois,
  ecrireEnvois,
  estIdentifiant,
  lireEnvois,
} from "@/lib/envois.ts";

import { Champ } from "./Champ";
import CalculEnDirect from "./CalculEnDirect";
import ChampCapture from "./ChampCapture";
import Turnstile from "./Turnstile";
import GuideCapture from "./GuideCapture";

const textes = libelles.formulaire;

/* Les motifs renvoyes par le serveur sont normalises : on les traduit ici plutot
   que d'afficher un identifiant technique a un livreur. */
const champs: Record<string, string> = libelles.champs_soumission;

/** Un detail est soit un code normalise, soit une erreur de champ. */
const decrireDetail = (detail: unknown): string => {
  if (typeof detail === "string") return motifs[detail] ?? detail;

  if (detail && typeof detail === "object" && "champ" in detail && "motif" in detail) {
    const { champ, motif } = detail as { champ: string; motif: string };
    return `${champs[champ] ?? champ} : ${motifsSoumission[motif] ?? motif}`;
  }

  return String(detail);
};

const motifs: Record<string, string> = {
  ...libelles.motifs_technique,
  ...libelles.motifs_capture,
  ...libelles.motifs_anti_fraude,
  ...libelles.motifs_authenticite,
  ...libelles.motifs_ocr,
};

const motifsSoumission: Record<string, string> = libelles.motifs_soumission;

/*
 * UN SEUL MÉCANISME POUR LE JETON. Il y en avait deux : une remise à zéro après
 * échec, et le rendu automatique du script au chargement. Le second ne
 * fonctionnait qu'une fois — le formulaire remonté après un succès n'obtenait
 * jamais de widget, donc jamais de jeton. Remonter le composant à chaque essai
 * couvre les deux cas avec la même opération.
 */

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
  /*
   * LE BROUILLON. Un livreur a perdu huit champs sur un rechargement suggéré par
   * un message d'erreur — « personne ne répétera ». Chaque frappe est désormais
   * conservée sur l'appareil, et relue au chargement : aucune erreur, quelle
   * qu'elle soit, ne peut plus coûter une saisie.
   *
   * Le brouillon vient du stockage tant que rien n'a été tapé dans cette
   * session — le même motif que le contexte juste au-dessus.
   */
  const memoireBrouillon = useSyncExternalStore(
    abonnerStockage,
    lireBrouillon,
    brouillonAuRendu
  );
  const [saisies, setSaisies] = useState<Brouillon | null>(null);
  const brouillon = saisies ?? decoderBrouillon(memoireBrouillon);

  const majBrouillon = (champ: keyof Brouillon, valeur: string) => {
    const suivant = { ...brouillon, [champ]: valeur };
    setSaisies(suivant);
    ecrireBrouillon(suivant);
  };

  const { autreVille, distance, prixPaye, pourboire, dureeEstimee, dureeReelle } =
    brouillon;

  /* Vrai quand le formulaire s'ouvre sur une saisie retrouvée : l'écran le dit,
     parce que la capture, elle, n'a pas pu être conservée. */
  const brouillonRestaure = saisies === null && brouillonRempli(brouillon);

  const [envoi, setEnvoi] = useState<"repos" | "en_cours">("repos");

  /*
   * Une course envoyee fige l'ecran. Sans cela, le formulaire reste rempli et le
   * bouton reste cliquable : le livreur ne sait pas si son envoi a abouti, et un
   * second clic produirait un doublon perceptuel de sa propre capture.
   */
  const [envoyee, setEnvoyee] = useState(false);

  /* Change a chaque remise a zero, pour vider le champ capture par remontage. */
  const [essai, setEssai] = useState(0);

  /*
   * Le jeton anti-robot, et le compteur qui remonte le widget. Séparé de
   * `essai` : après un simple champ oublié, il faut un jeton neuf mais surtout
   * pas reperdre la capture déjà choisie.
   */
  const [jeton, setJeton] = useState<string | null>(null);
  const [essaiTurnstile, setEssaiTurnstile] = useState(0);

  const renouvelerJeton = () => {
    setJeton(null);
    setEssaiTurnstile((precedent) => precedent + 1);
  };
  const [retourEnvoi, setRetourEnvoi] = useState<{
    reussite: boolean;
    message: string;
    /** Le motif brut, pour décider si un guide peut réparer le rejet. */
    motif?: string | null;
  } | null>(null);

  const contexte = contexteSaisi ?? decoder(memoire);
  const dateCourse = brouillon.dateCourse !== "" ? brouillon.dateCourse : dateDuJour;

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
      dureeReelleMinutes: analyserDuree(dureeReelle),
      dureeEstimeeMinutes: analyserDuree(dureeEstimee),
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

  /*
   * L'instant du premier champ touché. Une référence et non un état : le noter
   * ne doit rien redessiner, et sa valeur ne sert qu'une fois, à l'envoi.
   */
  const premierContact = useRef<number | null>(null);

  const noterPremierContact = () => {
    premierContact.current ??= Date.now();
  };

  const envoyer = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();

    const formulaire = new FormData(evenement.currentTarget);

    /*
     * Le temps de remplissage, et rien d'autre : un nombre de secondes, et un
     * type d'appareil réduit à deux valeurs. Le dossier exige un formulaire
     * rempli en moins de quatre-vingt-dix secondes sur téléphone ; sans mesure,
     * cette exigence ne serait qu'une intention. Ce chiffre juge le formulaire,
     * jamais la course : le serveur ne s'en sert pour aucun verdict.
     */
    if (premierContact.current !== null) {
      formulaire.append(
        "duree_remplissage_secondes",
        String((Date.now() - premierContact.current) / 1000)
      );
    }

    /* Une seule capacité interrogée — un pointeur grossier, c'est-à-dire un
       doigt. Ni modèle, ni système, ni taille d'écran. */
    formulaire.append(
      "appareil",
      window.matchMedia("(pointer: coarse)").matches ? APPAREILS.tactile : APPAREILS.autre
    );

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
    /*
     * DEUX VOIES POUR LE MÊME JETON, ET LA SOUMISSION ACCEPTE LES DEUX.
     *
     * Le widget appelle notre fonction avec le jeton, et dépose aussi un champ
     * caché dans le formulaire. Ne lire que l'un des deux serait un pari : si le
     * rappel ne se déclenchait pas — script partiellement chargé, remontage au
     * mauvais moment — le livreur verrait « la vérification ne s'est pas
     * exécutée » alors que le jeton est là, sous ses yeux, dans le formulaire.
     *
     * Cette redondance ne coûte rien et supprime une classe entière d'échecs que
     * je n'ai aucun moyen de reproduire : un navigateur automatisé est
     * précisément ce que Turnstile refuse.
     */
    const depose = formulaire.get("cf-turnstile-response");
    const jetonEnvoye =
      jeton !== null && jeton !== ""
        ? jeton
        : typeof depose === "string" && depose !== ""
          ? depose
          : null;

    if (jetonEnvoye === null) {
      setRetourEnvoi({ reussite: false, message: textes.envoi.turnstile_sans_jeton });
      return;
    }

    /* Le widget est rendu explicitement : son jeton n'est pas déposé dans le
       formulaire, il est passé ici. */
    formulaire.set("cf-turnstile-response", jetonEnvoye);

    setEnvoi("en_cours");
    setRetourEnvoi(null);

    try {
      const reponse = await fetch("/api/courses", { method: "POST", body: formulaire });
      const corps = (await reponse.json()) as {
        statut?: string;
        motif?: string;
        details?: unknown;
        id?: string;
      };

      const reussite = reponse.ok && corps.statut !== "rejetee_auto";

      /*
       * Le motif est normalisé : l'afficher permet de dire quel filtre a parlé.
       * Les détails peuvent être des codes ou des erreurs de champ ; les deux
       * sont traduits, car « [object Object] » à l'écran n'aide personne — et
       * cachait précisément le champ fautif.
       */
      const precision = Array.isArray(corps.details)
        ? ` — ${corps.details.map(decrireDetail).join(" ; ")}`
        : "";

      setRetourEnvoi({
        reussite,
        motif: corps.motif ?? null,
        message: reussite
          ? textes.envoi.reussite
          : `${textes.envoi.rejet} ${motifs[corps.motif ?? ""] ?? corps.motif ?? ""}${precision}`.trim(),
      });

      if (reussite) {
        /*
         * L'identifiant est retenu ICI, sur l'appareil, et nulle part ailleurs.
         * C'est la seule façon dont ce livreur apprendra le sort d'une lecture
         * qui se fera un quart d'heure plus tard : le site n'a ni compte, ni
         * adresse, et ne peut le joindre d'aucune manière.
         */
        if (estIdentifiant(corps.id)) {
          const maximum = reglagesInterface.envois.memorises_maximum;
          ecrireEnvois(
            ajouterEnvoi(
              decoderEnvois(lireEnvois(), maximum),
              { id: corps.id, envoyeLe: new Date().toISOString() },
              maximum
            )
          );
        }

        /* Le brouillon a fait son travail : la course est partie. Il s'efface
           ici, jamais avant — ni à l'envoi, ni après un échec. */
        effacerBrouillon();
        setEnvoyee(true);
      } else {
        /* Le jeton vient d'etre consomme : sans nouvelle validation, le prochain
           essai echouerait pour une raison sans rapport avec la premiere. */
        renouvelerJeton();
      }
    } catch {
      setRetourEnvoi({ reussite: false, message: textes.envoi.erreur_reseau });
      renouvelerJeton();
    } finally {
      setEnvoi("repos");
    }
  };

  /*
   * Enchainer une autre course : on vide ce qui change d'une course a l'autre et
   * on garde ce qui ne change pas. C'est le cas reel d'un livreur qui saisit sa
   * soiree en serie.
   */
  const reprendre = () => {
    setSaisies(BROUILLON_VIDE);
    effacerBrouillon();
    /* La date repart du jour, comme le reste du brouillon. */
    setRetourEnvoi(null);
    setEnvoyee(false);
    setEssai((precedent) => precedent + 1);
    renouvelerJeton();
  };

  const limiteAnciennete = dateDuJour === "" ? null : ancienneteMaximale(dateDuJour);
  const anciennete = joursEcoules(dateCourse, dateDuJour);
  const tropAncienne =
    limiteAnciennete !== null && anciennete !== null && anciennete > limiteAnciennete;

  if (envoyee) {
    return (
      <div className="space-y-6">
        <section className="rounded-lg border border-mesure/40 bg-mesure-clair p-4">
          <h2 className="text-base font-semibold text-mesure">
            {textes.succes.titre}
          </h2>
          <p className="mt-2 text-sm text-mesure">{textes.succes.explication}</p>
        </section>

        <section>
          <h3 className="etiquette-section">
            {textes.succes.recapitulatif}
          </h3>
          <div className="mt-2">
            <CalculEnDirect
              anomalies={[]}
              course={course}
              resultat={resultat}
              tauxCotisations={taux}
            />
          </div>
        </section>

        <section className="space-y-3">
          <button
            className="bouton-principal"
            onClick={reprendre}
            type="button"
          >
            {textes.succes.autre}
          </button>
          <p className="text-xs text-neutral-600">{textes.succes.autre_aide}</p>

          {/* Le sort de cet envoi se lira là, et nulle part ailleurs : la lecture
              est différée et le site n'a aucun moyen de prévenir. */}
          <Link
            className="block text-sm font-medium text-mesure underline underline-offset-2"
            href="/envois"
          >
            {textes.succes.suivi}
          </Link>

          <Link
            className="block text-sm underline underline-offset-2 hover:text-neutral-900"
            href="/statistiques"
          >
            {textes.succes.statistiques}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={envoyer}
      onFocusCapture={noterPremierContact}
      onInputCapture={noterPremierContact}
    >
      {brouillonRestaure ? (
        <p className="rounded-md border border-mesure/40 bg-mesure-clair px-3 py-2 text-sm text-mesure">
          {textes.brouillon_restaure}
        </p>
      ) : null}

      <section className="carte space-y-4">
        <div>
          <h2 className="etiquette-section">{textes.section_contexte}</h2>
          <p className="text-xs text-neutral-600">{textes.section_contexte_aide}</p>
        </div>

        <Champ identifiant="ville" intitule={textes.champs.ville}>
          <select
            className="champ champ-select"
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
              className="champ"
              id="autre-ville"
            name="ville_libre"
              onChange={(evenement) => majBrouillon("autreVille", evenement.target.value)}
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
            className="champ champ-select"
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
            className="champ champ-select"
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

      <section className="carte space-y-4">
        <h2 className="etiquette-section">{textes.section_course}</h2>

        <Champ identifiant="date-course" intitule={textes.champs.date_course}>
          <input
            className="champ"
            id="date-course"
            name="date_course"
            max={dateDuJour}
            onChange={(evenement) => majBrouillon("dateCourse", evenement.target.value)}
            type="date"
            value={dateCourse}
          />
        </Champ>

        {tropAncienne && limiteAnciennete !== null ? (
          <p className="rounded-md border border-ecart/40 bg-ecart-clair px-3 py-2 text-sm text-ecart">
            {textes.anciennete_depassee.replace(
              "{limite}",
              formaterValeur(limiteAnciennete, UNITES.jours)
            )}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Champ identifiant="distance" intitule={textes.champs.distance_km}>
            <input
              className="champ"
              id="distance"
            name="distance_km"
              inputMode="decimal"
              onChange={(evenement) => majBrouillon("distance", evenement.target.value)}
              type="text"
              value={distance}
            />
          </Champ>

          <Champ identifiant="prix-paye" intitule={textes.champs.prix_paye}>
            <input
              className="champ"
              id="prix-paye"
            name="prix_paye_euros"
              inputMode="decimal"
              onChange={(evenement) => majBrouillon("prixPaye", evenement.target.value)}
              type="text"
              value={prixPaye}
            />
          </Champ>

          <Champ identifiant="duree-estimee" intitule={textes.champs.duree_estimee}>
            <input
              className="champ"
              id="duree-estimee"
              placeholder={textes.exemples.duree}
            name="duree_estimee_minutes"
              inputMode="numeric"
              onChange={(evenement) => majBrouillon("dureeEstimee", evenement.target.value)}
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
              className="champ"
              id="duree-reelle"
              placeholder={textes.exemples.duree}
            name="duree_reelle_minutes"
              inputMode="numeric"
              onChange={(evenement) => majBrouillon("dureeReelle", evenement.target.value)}
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
            className="champ"
            id="pourboire"
            name="pourboire_euros"
            inputMode="decimal"
            onChange={(evenement) => majBrouillon("pourboire", evenement.target.value)}
            type="text"
            value={pourboire}
          />
        </Champ>
      </section>

      {dateCourse === "" ? null : (
        <section className="carte">
          <ChampCapture
            dateCourse={dateCourse}
            key={essai}
            premiereVisite={memoire === null}
          />
        </section>
      )}

      <CalculEnDirect
        anomalies={anomalies}
        course={course}
        resultat={resultat}
        tauxCotisations={taux}
      />

      <section className="carte">
        {cleTurnstile ? (
          <>
            <p className="etiquette-section">{textes.envoi.verification}</p>
            <p className="text-xs text-neutral-600">{textes.envoi.verification_aide}</p>
            <Turnstile cle={cleTurnstile} key={essaiTurnstile} onJeton={setJeton} />
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
          <>
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                retourEnvoi.reussite
                  ? "border-mesure/40 bg-mesure-clair text-mesure"
                  : "border-ecart/40 bg-ecart-clair text-ecart"
              }`}
            >
              {retourEnvoi.message}
            </p>

            {/*
              * LE REJET ENSEIGNE. Un motif technique seul perd un testeur ; le
              * même motif suivi de « voici l'écran qu'il faut » en garde un.
              * C'est le moment exact où il est réceptif — il vient d'échouer et
              * il a encore son téléphone en main.
              */}
            {!retourEnvoi.reussite && appelleLeGuide(retourEnvoi.motif) ? (
              <GuideCapture ouvert introduction={libelles.formulaire.guide_capture.apres_rejet} />
            ) : null}
          </>
        ) : null}
      </section>
    </form>
  );
}
