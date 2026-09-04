/**
 * La carte, brique visuelle commune à tout le site.
 *
 * Un fond blanc sur le gris de la page, un cadre franc, un intitulé en petites
 * capitales. Elle existe pour que les six pages ne divergent pas : une règle
 * écrite une fois et appelée partout ne peut pas dériver page par page, alors
 * qu'une classe recopiée dérive toujours.
 *
 * `accent` marque la carte qui porte la donnée principale d'une page — une par
 * page au plus, sinon plus rien ne ressort.
 */
export default function Carte({
  titre,
  aide,
  accent = false,
  children,
}: {
  titre?: string;
  aide?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border bg-white p-4 sm:p-5 ${
        accent ? "border-neutral-300 shadow-xs" : "border-neutral-200"
      }`}
    >
      {titre === undefined ? null : (
        <div className="mb-4">
          <h2 className="text-xs font-medium tracking-wide text-neutral-600 uppercase">
            {titre}
          </h2>
          {aide === undefined ? null : (
            <p className="mt-1.5 text-xs text-neutral-600">{aide}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export const TONS = {
  mesure: "bg-mesure-clair text-mesure ring-mesure/25",
  ecart: "bg-ecart-clair text-ecart ring-ecart/30",
  neutre: "bg-neutral-100 text-neutral-700 ring-neutral-400/30",
} as const;

export type Ton = keyof typeof TONS;

/**
 * Une étiquette d'état. Trois tons, et pas un de plus : ce qui est prouvé, ce
 * qui manque, et ce qui est simplement déclaré. Le rouge ne sert qu'à la
 * troisième chose que ce site sait dire — un écart — et c'est pourquoi il se
 * remarque encore quand il apparaît.
 */
export function Etiquette({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONS[ton]}`}
    >
      {children}
    </span>
  );
}
