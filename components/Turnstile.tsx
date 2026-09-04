"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

/**
 * Le widget anti-robot, rendu explicitement.
 *
 * LE BUG QU'IL CORRIGE, constaté en production sur le parcours qui compte le
 * plus. Une première course part, l'écran de succès s'affiche, « Publier une
 * autre course » remonte le formulaire — et l'envoi suivant échoue sur « la
 * vérification anti-robot ne s'est pas exécutée ».
 *
 * La cause : le script de Cloudflare cherche les éléments à habiller UNE FOIS,
 * au chargement. Le conteneur du second formulaire n'existait pas encore à ce
 * moment-là ; il reste donc vide, et aucun jeton n'est jamais produit. La
 * réinitialisation existante ne pouvait rien y faire — elle remet à zéro un
 * widget rendu, elle n'en crée pas.
 *
 * D'où le rendu explicite : à chaque montage, ce composant demande lui-même le
 * widget, et le retire au démontage. Le parcours en série — une soirée de
 * courses saisies l'une après l'autre, sans rechargement — fonctionne alors
 * autant de fois que nécessaire, ce qui est la seule façon dont il sera vécu.
 */

interface ApiTurnstile {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback?: (jeton: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => string | undefined;
  remove: (identifiant: string) => void;
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

const INTERVALLE_ATTENTE = 150;

export default function Turnstile({
  cle,
  onJeton,
}: {
  cle: string;
  onJeton: (jeton: string | null) => void;
}) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const identifiant = useRef<string | null>(null);

  /* Le rappel change à chaque rendu du parent ; le garder dans une référence
     évite de détruire et recréer le widget à chaque frappe du livreur. La
     référence se met à jour dans un effet, jamais pendant le rendu. */
  const rappel = useRef(onJeton);

  useEffect(() => {
    rappel.current = onJeton;
  }, [onJeton]);

  useEffect(() => {
    let annule = false;

    const rendre = (): boolean => {
      if (annule || identifiant.current !== null) return true;
      if (conteneur.current === null || window.turnstile === undefined) return false;

      identifiant.current =
        window.turnstile.render(conteneur.current, {
          sitekey: cle,
          callback: (jeton) => rappel.current(jeton),
          "expired-callback": () => rappel.current(null),
          "error-callback": () => rappel.current(null),
        }) ?? null;

      return identifiant.current !== null;
    };

    /* Le script peut n'être pas encore là : on réessaie jusqu'à ce qu'il arrive,
       plutôt que de supposer un ordre de chargement. */
    let minuteur: ReturnType<typeof setInterval> | null = null;
    if (!rendre()) {
      minuteur = setInterval(() => {
        if (rendre() && minuteur !== null) clearInterval(minuteur);
      }, INTERVALLE_ATTENTE);
    }

    return () => {
      annule = true;
      if (minuteur !== null) clearInterval(minuteur);

      if (identifiant.current !== null) {
        try {
          window.turnstile?.remove(identifiant.current);
        } catch {
          /* Widget déjà retiré par le script : rien à faire. */
        }
        identifiant.current = null;
      }
    };
  }, [cle]);

  return (
    <>
      <div className="mt-2" ref={conteneur} />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
    </>
  );
}
