/**
 * Verification Turnstile, cote serveur.
 *
 * Le jeton produit par le navigateur ne vaut rien tant qu'il n'a pas ete
 * verifie ici : un controle cote client se contourne en trois secondes.
 *
 * La lecture de la reponse est separee de l'appel reseau, pour rester testable
 * sans joindre Cloudflare.
 */

export const URL_VERIFICATION_TURNSTILE =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface ReponseTurnstile {
  success?: boolean;
  "error-codes"?: string[];
}

export interface VerdictTurnstile {
  valide: boolean;
  erreurs: string[];
}

/** Une reponse absente, illisible ou negative vaut refus : jamais l'inverse. */
export const interpreterTurnstile = (reponse: ReponseTurnstile | null): VerdictTurnstile => {
  if (reponse === null || typeof reponse !== "object") {
    return { valide: false, erreurs: ["reponse_illisible"] };
  }

  return {
    valide: reponse.success === true,
    erreurs: Array.isArray(reponse["error-codes"]) ? reponse["error-codes"] : [],
  };
};

export const turnstileConfigure = (): boolean =>
  typeof process.env.TURNSTILE_SECRET_KEY === "string" &&
  process.env.TURNSTILE_SECRET_KEY !== "";

export const verifierTurnstile = async (
  jeton: string | null,
  adresse: string | null
): Promise<VerdictTurnstile> => {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  /* Pas de secret configure : on refuse, on n'ouvre pas. Meme regle que le
     tableau de surveillance. */
  if (!secret) return { valide: false, erreurs: ["secret_absent"] };
  if (!jeton) return { valide: false, erreurs: ["jeton_absent"] };

  const corps = new URLSearchParams({ secret, response: jeton });
  if (adresse) corps.set("remoteip", adresse);

  try {
    const reponse = await fetch(URL_VERIFICATION_TURNSTILE, { method: "POST", body: corps });
    return interpreterTurnstile((await reponse.json()) as ReponseTurnstile);
  } catch {
    return { valide: false, erreurs: ["verification_injoignable"] };
  }
};
