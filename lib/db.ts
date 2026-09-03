/**
 * Connexion a la base Neon.
 *
 * Pilote @neondatabase/serverless : requetes par HTTP, sans pool TCP a gerer,
 * ce qui est ce qu'il faut en environnement serverless.
 *
 * Aucune valeur de repli : sans DATABASE_URL, on echoue franchement plutot que
 * d'ecrire ou de lire ailleurs.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export const baseDisponible = (): boolean =>
  typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";

export const db = (): NeonQueryFunction<false, false> => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL absente : aucune lecture ni ecriture n'est possible.");
  }

  client ??= neon(url);
  return client;
};
