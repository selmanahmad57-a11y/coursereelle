import libelles from "@/config/libelles.json";
import interfacePlateforme from "@/config/interface-uber.json";

const textes = libelles.formulaire.guide_capture;

/*
 * LES INTITULÉS DU SCHÉMA VIENNENT DE LA LISTE BLANCHE, pas d'une invention.
 * Ce sont exactement les mots que la lecture automatique cherche sur une
 * capture : montrer autre chose apprendrait au livreur à photographier un écran
 * que le site ne sait pas lire.
 */
const attendus = interfacePlateforme.libelles_attendus;
const libelle = (recherche: string, defaut: string) =>
  attendus.find((entree) => entree.toLowerCase().includes(recherche)) ?? defaut;

const DUREE = libelle("durée", "Durée");
const DISTANCE = libelle("distance", "Distance");
const REVENUS = libelle("revenus", "Vos revenus");

/**
 * Le bon écran : un récapitulatif d'après course.
 *
 * AUCUN MONTANT N'EST ÉCRIT. Un chiffre dessiné ici serait une valeur inventée
 * dans un site qui n'en tolère aucune ; un « € » et une barre disent « un
 * montant en gros » sans prétendre lequel.
 */
function VignetteBonne() {
  return (
    <svg
      aria-hidden="true"
      className="w-full"
      viewBox="0 0 120 150"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1"
        y="1"
        width="118"
        height="148"
        rx="8"
        className="fill-white stroke-mesure"
        strokeWidth="2"
      />
      <rect x="14" y="14" width="46" height="5" rx="2.5" className="fill-declare-clair" />

      <text x="14" y="52" className="fill-mesure" fontSize="26" fontWeight="600">
        €
      </text>
      <rect x="34" y="34" width="52" height="16" rx="3" className="fill-mesure" />

      <rect x="14" y="66" width="92" height="1" className="fill-declare-clair" />

      <text x="14" y="80" className="fill-declare" fontSize="8">
        {DUREE}
      </text>
      <text x="62" y="80" className="fill-declare" fontSize="8">
        {DISTANCE}
      </text>
      <rect x="14" y="86" width="30" height="5" rx="2.5" className="fill-declare-clair" />
      <rect x="62" y="86" width="30" height="5" rx="2.5" className="fill-declare-clair" />

      <rect x="14" y="104" width="92" height="1" className="fill-declare-clair" />
      <text x="14" y="120" className="fill-declare" fontSize="8">
        {REVENUS}
      </text>
      <rect x="14" y="126" width="44" height="6" rx="3" className="fill-declare-clair" />
    </svg>
  );
}

/** Les écrans sans montant : carte, navigation, course en cours. */
function VignetteMauvaise() {
  return (
    <svg
      aria-hidden="true"
      className="w-full"
      viewBox="0 0 120 150"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1"
        y="1"
        width="118"
        height="148"
        rx="8"
        className="fill-white stroke-declare"
        strokeWidth="2"
      />

      {/* Une carte : un itinéraire et un point d'arrivée. */}
      <path
        d="M16 128 C 40 110, 30 78, 56 66 S 92 44, 104 22"
        className="stroke-declare-clair"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="104" cy="22" r="7" className="fill-declare-clair" />
      <rect x="16" y="16" width="40" height="5" rx="2.5" className="fill-declare-clair" />

      {/* La croix : cet écran ne porte aucun montant. */}
      <path
        d="M28 28 L 92 122 M92 28 L 28 122"
        className="stroke-ecart"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Le guide du bon écran.
 *
 * Mesuré sur notre propre collecte : quatre spécimens sur cinq étaient des
 * écrans de navigation, sans le moindre montant. Un livreur ne sait pas
 * spontanément quel écran prouve quoi, et le texte le disait sans le montrer.
 *
 * `<details>` natif : replié, il ne coûte qu'une ligne au livreur habitué — les
 * quatre-vingt-dix secondes restent la loi — et il s'ouvre sans une ligne de
 * JavaScript.
 */
export default function GuideCapture({
  ouvert = false,
  introduction,
}: {
  ouvert?: boolean;
  introduction?: string;
}) {
  return (
    <details className="mt-3 rounded-md border border-trait bg-fond p-3" open={ouvert}>
      <summary className="cursor-pointer text-sm font-medium text-mesure">
        {textes.resume}
      </summary>

      {introduction === undefined ? null : (
        <p className="mt-2 text-sm text-encre">{introduction}</p>
      )}

      <p className="mt-2 text-sm text-encre">{textes.chemin}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <VignetteBonne />
          <p className="mt-1.5 text-xs font-semibold text-mesure">✓ {textes.bon_titre}</p>
          <p className="provenance mt-0.5">{textes.bon_aide}</p>
        </div>
        <div>
          <VignetteMauvaise />
          <p className="mt-1.5 text-xs font-semibold text-ecart">✗ {textes.mauvais_titre}</p>
          <p className="provenance mt-0.5">{textes.mauvais_aide}</p>
        </div>
      </div>

      <p className="provenance mt-3 border-t border-trait pt-2">{textes.note}</p>
    </details>
  );
}
