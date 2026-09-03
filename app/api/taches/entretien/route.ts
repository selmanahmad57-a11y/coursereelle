/**
 * Tâche périodique : supprimer les captures dont le délai est écoulé.
 *
 * POURQUOI UNE ROUTE, ALORS QUE LA COMMANDE EXISTE DÉJÀ. Avant déploiement, une
 * commande lancée à la main suffisait et n'exposait rien. Une fois le site en
 * ligne, elle cesse de suffire : le site publie une promesse de suppression sous
 * quarante-huit heures, et une promesse qui dépend d'un geste humain n'est pas
 * une garantie. Il faut donc une porte qu'un planificateur puisse pousser.
 *
 * Même fonction, nouvelle porte. Rien n'est réimplémenté ici : `lib/entretien.ts`
 * fait le travail, exactement comme pour `npm run entretien`.
 *
 * La réponse ne contient que des comptes. Ni identifiant de course, ni clé de
 * stockage, ni contenu : une route publique, même protégée, n'est pas l'endroit
 * où faire sortir ce que le reste du site s'applique à ne pas conserver.
 */

import { NextResponse } from "next/server";

import { aujourdhui } from "@/lib/contexte-livreur.ts";
import { tacheAutorisee } from "@/lib/cron.ts";
import { etatCaptures, supprimerCapturesEchues } from "@/lib/entretien.ts";
import { delaiSuppressionCaptureHeures } from "@/lib/parametres";

export const dynamic = "force-dynamic";

export async function GET(requete: Request) {
  if (!tacheAutorisee(requete.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ erreur: "non autorise" }, { status: 401 });
  }

  const maintenant = new Date();
  const delaiHeures = delaiSuppressionCaptureHeures(aujourdhui());

  const avant = await etatCaptures(maintenant, delaiHeures);

  if (avant === null) {
    return NextResponse.json({ erreur: "base indisponible" }, { status: 503 });
  }

  const entretien = await supprimerCapturesEchues(maintenant, delaiHeures);
  const apres = await etatCaptures(maintenant, delaiHeures);

  return NextResponse.json({ delaiHeures, avant, entretien, apres });
}
