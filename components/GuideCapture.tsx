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

const TITRE = libelle("détails de la course", "Détails de la course");
const ESTIMATION = libelle("estimation", "L'estimation pour cette course");
const DUREE = libelle("durée", "Durée");
const DISTANCE = libelle("distance", "Distance");
const REVENUS = libelle("revenus", "Vos revenus");

/*
 * LES DEUX VIGNETTES SONT DES SCHÉMAS FIDÈLES, PAS DES ABSTRACTIONS.
 *
 * La première version dessinait des barres grises sur fond clair : personne n'y
 * reconnaissait quoi que ce soit. Un livreur doit identifier son écran en une
 * demi-seconde, et il ne le fera que si la composition lui parle — le fond
 * sombre de l'application, le montant en très gros en haut, la carte au milieu,
 * la durée et la distance côte à côte.
 *
 * TROIS INTERDITS TIENNENT TOUJOURS. Pas de vraie capture : elle porterait
 * l'adresse d'un client. Pas de logo ni de reproduction de la marque : cette
 * interface ne nous appartient pas. Et pas un chiffre inventé — les montants
 * s'écrivent en X. Un gabarit dit « un montant ici » sans prétendre lequel, ce
 * qui est exactement la différence entre montrer et affirmer.
 *
 * Proportions d'un téléphone, 9:19 : une vignette carrée ne ressemble à aucun
 * écran.
 */
const CADRE = { largeur: 90, hauteur: 190 };

/** L'écran « Détails de la course » : celui qui porte la preuve. */
function VignetteBonne() {
  return (
    <svg
      aria-hidden="true"
      className="w-full rounded-md"
      viewBox={`0 0 ${CADRE.largeur} ${CADRE.hauteur}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="90" height="190" rx="6" className="fill-encre" />

      {/* Barre de titre, avec le retour et le nom de l'écran. */}
      <path d="M9 11 L6 8 L9 5" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1.2" />
      <text x="15" y="10" fill="white" fillOpacity="0.9" fontSize="5.2" fontWeight="500">
        {TITRE}
      </text>

      <text x="8" y="24" fill="white" fillOpacity="0.45" fontSize="4.2">
        XX/XX/XXXX
      </text>

      {/* Le montant, en très gros : c'est lui qu'on doit reconnaître. */}
      <text x="8" y="46" fill="white" fontSize="16" fontWeight="600">
        X,XX €
      </text>

      {/* L'encart d'estimation. */}
      <rect x="8" y="53" width="74" height="15" rx="3" fill="white" fillOpacity="0.08" />
      <text x="12" y="62" fill="white" fillOpacity="0.5" fontSize="4">
        {ESTIMATION}
      </text>

      {/* La carte du trajet. */}
      <rect x="8" y="73" width="74" height="30" rx="3" fill="white" fillOpacity="0.06" />
      <path
        d="M14 98 C 28 92, 30 82, 44 80 S 68 76, 76 79"
        fill="none"
        stroke="white"
        strokeOpacity="0.3"
        strokeWidth="1.6"
      />
      <circle cx="14" cy="98" r="2" fill="white" fillOpacity="0.5" />
      <circle cx="76" cy="79" r="2" fill="white" fillOpacity="0.5" />

      {/* Durée et distance, côte à côte : les deux champs que la lecture cherche. */}
      <text x="8" y="115" fill="white" fillOpacity="0.5" fontSize="4.2">
        {DUREE}
      </text>
      <text x="8" y="124" fill="white" fontSize="5.6" fontWeight="500">
        XX min XX s
      </text>
      <text x="48" y="115" fill="white" fillOpacity="0.5" fontSize="4.2">
        {DISTANCE}
      </text>
      <text x="48" y="124" fill="white" fontSize="5.6" fontWeight="500">
        XX,XX km
      </text>

      <rect x="8" y="131" width="74" height="0.6" fill="white" fillOpacity="0.12" />

      {/* Le trajet, en deux points. */}
      <circle cx="11" cy="141" r="1.8" fill="white" fillOpacity="0.55" />
      <path d="M11 143 L11 152" stroke="white" strokeOpacity="0.25" strokeWidth="0.8" />
      <circle cx="11" cy="154" r="1.8" fill="white" fillOpacity="0.55" />
      <rect x="17" y="139" width="52" height="3.4" rx="1.7" fill="white" fillOpacity="0.16" />
      <rect x="17" y="152" width="44" height="3.4" rx="1.7" fill="white" fillOpacity="0.16" />

      <rect x="8" y="163" width="74" height="0.6" fill="white" fillOpacity="0.12" />

      {/* « Vos revenus », en bas. */}
      <text x="8" y="175" fill="white" fillOpacity="0.5" fontSize="4.2">
        {REVENUS}
      </text>
      <text x="62" y="175" fill="white" fontSize="5.2" fontWeight="500">
        X,XX €
      </text>
    </svg>
  );
}

/** L'écran de navigation : celui qui ne prouve rien. */
function VignetteMauvaise() {
  return (
    <svg
      aria-hidden="true"
      className="w-full rounded-md"
      viewBox={`0 0 ${CADRE.largeur} ${CADRE.hauteur}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="90" height="190" rx="6" className="fill-encre" />

      {/* Le fond de carte : des rues claires sur fond sombre. */}
      <g stroke="white" strokeOpacity="0.13" strokeWidth="2.4" fill="none">
        <path d="M-5 46 L95 38" />
        <path d="M-5 96 L95 104" />
        <path d="M-5 148 L95 140" />
        <path d="M22 -5 L14 195" />
        <path d="M58 -5 L66 195" />
      </g>
      <g stroke="white" strokeOpacity="0.07" strokeWidth="1.2" fill="none">
        <path d="M-5 70 L95 66" />
        <path d="M-5 122 L95 126" />
        <path d="M40 -5 L38 195" />
      </g>

      {/* Le tracé de l'itinéraire, et ses deux extrémités. */}
      <path
        d="M20 150 L20 104 L64 100 L66 52"
        fill="none"
        className="stroke-mesure"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="150" r="3.4" fill="#3fa34d" />
      <circle cx="66" cy="52" r="3.4" className="fill-ecart" />

      {/* La barre de recherche, et le bandeau de course en bas. */}
      <rect x="8" y="8" width="74" height="12" rx="6" fill="white" fillOpacity="0.14" />
      <rect x="14" y="13" width="34" height="2.4" rx="1.2" fill="white" fillOpacity="0.3" />
      <rect x="6" y="156" width="78" height="28" rx="4" fill="white" fillOpacity="0.12" />
      <rect x="12" y="163" width="40" height="3.4" rx="1.7" fill="white" fillOpacity="0.3" />
      <rect x="12" y="172" width="26" height="3.4" rx="1.7" fill="white" fillOpacity="0.22" />

      {/*
        * La croix vient APRÈS la reconnaissance, pas avant : il faut d'abord
        * reconnaître « l'écran où je conduis », et seulement ensuite comprendre
        * qu'il ne convient pas. Trop épaisse, elle masquait la carte et ne
        * laissait voir qu'un refus sans objet.
        */}
      <path
        d="M22 34 L68 156 M68 34 L22 156"
        className="stroke-ecart"
        strokeWidth="4"
        strokeLinecap="round"
        strokeOpacity="0.72"
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
