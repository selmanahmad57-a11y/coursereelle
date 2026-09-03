/**
 * Les briques de saisie partagées par les deux formulaires.
 *
 * Les classes sont réunies ici pour que le formulaire de course et celui de
 * session ne divergent pas visuellement, et pour que les tailles de police
 * restent celles qui évitent le zoom automatique sur mobile.
 */

export const classesSaisie =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 focus:border-neutral-900 focus:outline-none";

export function Champ({
  identifiant,
  intitule,
  aide,
  children,
}: {
  identifiant: string;
  intitule: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-800" htmlFor={identifiant}>
        {intitule}
      </label>
      {children}
      {aide ? <p className="mt-1 text-xs text-neutral-600">{aide}</p> : null}
    </div>
  );
}

export function Ligne({
  intitule,
  valeur,
  accent = false,
}: {
  intitule: string;
  valeur: string | null;
  accent?: boolean;
}) {
  if (valeur === null) return null;

  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-neutral-600">{intitule}</dt>
      <dd
        className={`font-mono tabular-nums ${
          accent ? "text-xl font-semibold text-neutral-900" : "text-sm text-neutral-800"
        }`}
      >
        {valeur}
      </dd>
    </div>
  );
}
