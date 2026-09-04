/**
 * Les rejets qu'un guide visuel peut réparer.
 *
 * Tous les motifs ne s'enseignent pas. Un format d'image refusé se corrige en
 * changeant de format ; un doublon se corrige en changeant de course. Mais un
 * gabarit non reconnu et une lecture qui échoue disent presque toujours la même
 * chose : ce n'était pas le bon écran.
 *
 * Mesuré sur notre propre collecte : quatre spécimens sur cinq étaient des
 * écrans de navigation, sans le moindre montant. Le livreur n'avait pas mal
 * photographié, il avait photographié autre chose.
 *
 * Module pur : la liste est fermée, et un motif inconnu n'appelle pas le guide —
 * montrer « voici le bon écran » après un refus qui n'a rien à voir avec l'écran
 * apprendrait au lecteur à ignorer le guide.
 */

export const MOTIFS_GUIDE_CAPTURE = [
  "gabarit_non_reconnu",
  "echec_lecture",
  "lecture_ambigue",
] as const;

export type MotifGuide = (typeof MOTIFS_GUIDE_CAPTURE)[number];

export const appelleLeGuide = (motif: string | null | undefined): boolean => {
  if (typeof motif !== "string" || motif === "") return false;

  /* Le serveur peut renvoyer plusieurs motifs séparés par des virgules. */
  return motif
    .split(",")
    .map((part) => part.trim())
    .some((part) => (MOTIFS_GUIDE_CAPTURE as readonly string[]).includes(part));
};
