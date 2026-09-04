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
const PRIX_TOTAL = libelle("prix total du trajet", "Prix total du trajet");
const GAINS = "Gains";
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

/**
 * La carte, dessinée une fois pour les deux vignettes.
 *
 * L'écran « Détails » montre la même carte que l'écran de navigation, en plus
 * petit : mêmes rues, même tracé, même point de départ et même point d'arrivée.
 * Les dessiner de deux façons rendait la vignette du récapitulatif abstraite là
 * où l'autre était fidèle. Un seul moteur visuel, deux échelles.
 *
 * COULEURS D'ILLUSTRATION, PAS COULEURS DE RÔLE. Le vert de départ et le rouge
 * d'arrivée n'appartiennent pas aux quatre rôles du site : ils appartiennent au
 * vocabulaire commun des applications de navigation, et c'est lui que le livreur
 * reconnaît. Ils vivent dans cette citation, jamais dans un composant.
 */
function Carte({
  x,
  y,
  largeur,
  hauteur,
  epaisseur = 1,
}: {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  epaisseur?: number;
}) {
  const px = (part: number) => x + largeur * part;
  const py = (part: number) => y + hauteur * part;

  return (
    <>
      <g stroke="white" strokeOpacity="0.12" strokeWidth={2.2 * epaisseur} fill="none">
        <path d={`M${x} ${py(0.32)} L${x + largeur} ${py(0.26)}`} />
        <path d={`M${x} ${py(0.72)} L${x + largeur} ${py(0.78)}`} />
        <path d={`M${px(0.24)} ${y} L${px(0.18)} ${y + hauteur}`} />
        <path d={`M${px(0.68)} ${y} L${px(0.74)} ${y + hauteur}`} />
      </g>
      <g stroke="white" strokeOpacity="0.06" strokeWidth={1.1 * epaisseur} fill="none">
        <path d={`M${x} ${py(0.53)} L${x + largeur} ${py(0.5)}`} />
        <path d={`M${px(0.46)} ${y} L${px(0.44)} ${y + hauteur}`} />
      </g>

      {/*
        * Les deux extrémités restent à l'écart de ce qui les entoure : le départ
        * au-dessus de la barre d'instructions, l'arrivée hors du badge de refus.
        * Un point posé sur un autre élément se lit comme une erreur de dessin.
        */}
      <path
        d={`M${px(0.2)} ${py(0.78)} L${px(0.2)} ${py(0.52)} L${px(0.53)} ${py(0.46)} L${px(0.56)} ${py(0.26)}`}
        fill="none"
        className="stroke-mesure"
        strokeWidth={3 * epaisseur}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={px(0.2)} cy={py(0.78)} r={3 * epaisseur} fill="#3fa34d" />
      <circle cx={px(0.56)} cy={py(0.26)} r={3 * epaisseur} className="fill-ecart" />
    </>
  );
}

/**
 * D'où l'on vient : la liste des gains, une course touchée.
 *
 * Le récapitulatif n'apparaît jamais seul — on y arrive depuis une liste. Sans
 * ce contexte, la vignette montre une destination sans son chemin, et c'est le
 * chemin que personne ne connaît.
 */
function VignetteGains() {
  return (
    <svg
      aria-hidden="true"
      className="w-full rounded"
      viewBox="0 0 90 46"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="90" height="46" rx="4" className="fill-encre" />
      <text x="8" y="12" fill="white" fillOpacity="0.9" fontSize="5.2" fontWeight="600">
        {GAINS}
      </text>

      <rect x="6" y="17" width="78" height="10" rx="2" fill="white" fillOpacity="0.05" />
      <rect x="10" y="20" width="34" height="3" rx="1.5" fill="white" fillOpacity="0.28" />
      <rect x="66" y="20" width="14" height="3" rx="1.5" fill="white" fillOpacity="0.28" />

      {/* La ligne touchée : c'est elle qui mène au récapitulatif. */}
      <rect x="6" y="29" width="78" height="11" rx="2" fill="white" fillOpacity="0.16" />
      <rect x="10" y="32.5" width="30" height="3.4" rx="1.7" fill="white" fillOpacity="0.5" />
      <rect x="62" y="32.5" width="16" height="3.4" rx="1.7" fill="white" fillOpacity="0.6" />
      <path d="M80.5 33 L82.5 34.7 L80.5 36.4" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="0.9" />
    </svg>
  );
}

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

      <path d="M9 11 L6 8 L9 5" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1.2" />
      <text x="15" y="10" fill="white" fillOpacity="0.9" fontSize="5.2" fontWeight="500">
        {TITRE}
      </text>

      <text x="8" y="23" fill="white" fillOpacity="0.45" fontSize="4.2">
        XX/XX/XXXX
      </text>

      <text x="8" y="44" fill="white" fontSize="16" fontWeight="600">
        X,XX €
      </text>

      <rect x="8" y="51" width="74" height="14" rx="3" fill="white" fillOpacity="0.08" />
      <text x="12" y="60" fill="white" fillOpacity="0.5" fontSize="4">
        {ESTIMATION}
      </text>

      {/* La même carte que l'écran de navigation, en petit. */}
      <rect x="8" y="70" width="74" height="30" rx="3" fill="white" fillOpacity="0.05" />
      <Carte x={8} y={70} largeur={74} hauteur={30} epaisseur={0.62} />

      <text x="8" y="112" fill="white" fillOpacity="0.5" fontSize="4.2">
        {DUREE}
      </text>
      <text x="8" y="121" fill="white" fontSize="5.6" fontWeight="500">
        XX min XX s
      </text>
      <text x="48" y="112" fill="white" fillOpacity="0.5" fontSize="4.2">
        {DISTANCE}
      </text>
      <text x="48" y="121" fill="white" fontSize="5.6" fontWeight="500">
        XX,XX km
      </text>

      <rect x="8" y="128" width="74" height="0.6" fill="white" fillOpacity="0.12" />

      {/* Le trajet : un rond au départ, un carré à l'arrivée, reliés. */}
      <circle cx="11.5" cy="138" r="2.2" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1.2" />
      <path d="M11.5 141 L11.5 149" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
      <rect x="9.3" y="149.8" width="4.4" height="4.4" rx="0.6" fill="white" fillOpacity="0.7" />
      <rect x="19" y="136" width="58" height="3.6" rx="1.8" fill="white" fillOpacity="0.22" />
      <rect x="19" y="150" width="41" height="3.6" rx="1.8" fill="white" fillOpacity="0.22" />

      <rect x="8" y="161" width="74" height="0.6" fill="white" fillOpacity="0.12" />

      {/* « Vos revenus » : titre en gras, puis la ligne du prix total. */}
      <text x="8" y="172" fill="white" fontSize="5.4" fontWeight="600">
        {REVENUS}
      </text>
      <text x="8" y="182" fill="white" fillOpacity="0.5" fontSize="4.2">
        {PRIX_TOTAL}
      </text>
      <text x="82" y="182" fill="white" fontSize="5" fontWeight="500" textAnchor="end">
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

      <Carte x={0} y={0} largeur={90} hauteur={190} />

      <rect x="8" y="8" width="74" height="12" rx="6" fill="white" fillOpacity="0.14" />
      <rect x="14" y="13" width="34" height="2.4" rx="1.2" fill="white" fillOpacity="0.3" />

      {/* La barre d'instructions, en bas : c'est elle qui dit « je conduis ». */}
      <rect x="6" y="154" width="78" height="30" rx="4" fill="white" fillOpacity="0.16" />
      <rect x="12" y="160" width="44" height="4" rx="2" fill="white" fillOpacity="0.45" />
      <rect x="12" y="169" width="28" height="3.4" rx="1.7" fill="white" fillOpacity="0.3" />
      <rect x="64" y="160" width="14" height="14" rx="3" fill="white" fillOpacity="0.22" />

      {/*
        * LE REFUS EN COIN, ET NON EN TRAVERS.
        *
        * Une croix jetée sur toute la vignette croisait l'itinéraire et le point
        * d'arrivée — tous deux rouges — et l'œil mettait une seconde à démêler
        * le dessin du verdict. Un badge laisse la carte entièrement lisible :
        * on reconnaît l'écran où l'on conduit, puis on voit qu'il est écarté.
        */}
      <circle cx="72" cy="40" r="14" className="fill-ecart" />
      <circle cx="72" cy="40" r="14" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="1.6" />
      <path
        d="M66 34 L78 46 M78 34 L66 46"
        stroke="white"
        strokeWidth="3"
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
          <VignetteGains />
          <svg aria-hidden="true" className="mx-auto my-1 block h-3 w-3" viewBox="0 0 12 12">
            <path
              d="M6 1 L6 9 M2.5 6 L6 10 L9.5 6"
              fill="none"
              className="stroke-declare"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <VignetteBonne />
          <p className="mt-1.5 text-xs font-semibold text-mesure">✓ {textes.bon_titre}</p>
          <p className="provenance mt-0.5">{textes.bon_aide}</p>
        </div>
        <div>
          {/* Décalage exactement égal à la vignette de contexte et à sa flèche —
              par le même rapport de forme, donc juste à toutes les largeurs.
              Comparer deux images décalées coûte une seconde de lecture. */}
          <div aria-hidden="true" className="aspect-[90/46] w-full" />
          <div aria-hidden="true" className="my-1 h-3" />
          <VignetteMauvaise />
          <p className="mt-1.5 text-xs font-semibold text-ecart">✗ {textes.mauvais_titre}</p>
          <p className="provenance mt-0.5">{textes.mauvais_aide}</p>
        </div>
      </div>

      <p className="provenance mt-3 border-t border-trait pt-2">{textes.note}</p>
    </details>
  );
}
