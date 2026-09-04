/**
 * Tâche périodique : lire les captures en attente et rendre les verdicts.
 *
 * Le filtre 2 est différé exprès — un échec de lecture ne doit jamais faire
 * échouer un envoi par ailleurs valide. Ce report n'a de sens que si quelque
 * chose reprend le travail sans qu'on le lui demande : sinon les courses
 * resteraient « en attente » indéfiniment, ce qui serait une autre façon de ne
 * jamais rendre de verdict.
 *
 * Le moteur de reconnaissance écrit ses données de langue sur le disque au
 * démarrage. En environnement serverless, seul le répertoire temporaire est
 * inscriptible : `os.tmpdir()` le désigne sans supposer de chemin.
 *
 * CE QUI EST MESURÉ, ET QUI N'EST PAS RÉSOLU. En production, cette route expire
 * au bout des trois cents secondes accordées à une fonction, sans qu'aucune
 * course soit en attente : le moteur ne parvient pas à s'initialiser dans une
 * fonction serverless. L'hypothèse du bundler a été testée le 4 septembre 2026 —
 * externaliser tesseract.js et embarquer ses fichiers par
 * `outputFileTracingIncludes` — et ne change rien : même expiration, même durée.
 * La cause reste donc à établir. La route est conservée parce que le problème est celui de
 * l'initialisation, pas celui du code appelant — mais aucune planification ne la
 * vise tant qu'elle n'aura pas été rendue viable. Une porte qui ne s'ouvre pas
 * doit être annoncée comme telle plutôt que laissée dans une liste de tâches.
 *
 * La réponse ne contient que des comptes et des motifs. Aucun texte lu sur une
 * capture ne traverse cette route — la même règle que partout ailleurs, et elle
 * vaut d'autant plus ici que la sortie part sur le réseau.
 */

import { tmpdir } from "node:os";

import { NextResponse } from "next/server";

import baremes from "@/config/baremes.json";
import captures from "@/config/captures.json";
import interfaceUber from "@/config/interface-uber.json";
import taches from "@/config/taches.json";

import { aujourdhui } from "@/lib/contexte-livreur.ts";
import { tacheAutorisee } from "@/lib/cron.ts";
import { arreterLecteur, demarrerLecteur } from "@/lib/ocr-tesseract.ts";
import { reglesTraitementDepuis } from "@/lib/regles-traitement.ts";
import { traiterEnAttente } from "@/lib/traitement-lecture.ts";

export const dynamic = "force-dynamic";

/* La lecture est bornée par le lot, pas par le temps : voir la justification
   chiffrée dans config/taches.json. */
export const maxDuration = 300;

export async function GET(requete: Request) {
  if (!tacheAutorisee(requete.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ erreur: "non autorise" }, { status: 401 });
  }

  const regles = reglesTraitementDepuis(baremes, interfaceUber, captures, aujourdhui());

  await demarrerLecteur(tmpdir());

  try {
    const verdicts = await traiterEnAttente(regles, taches.lecture.courses_par_passage);

    const motifs: Record<string, number> = {};
    for (const verdict of verdicts) {
      if (verdict.motif === null) continue;
      motifs[verdict.motif] = (motifs[verdict.motif] ?? 0) + 1;
    }

    return NextResponse.json({
      traitees: verdicts.length,
      validees: verdicts.filter((verdict) => verdict.statut === "validee_auto").length,
      rejetees: verdicts.filter((verdict) => verdict.statut === "rejetee_auto").length,
      motifs,
    });
  } finally {
    await arreterLecteur();
  }
}
