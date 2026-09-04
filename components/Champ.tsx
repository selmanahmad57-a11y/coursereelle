/**
 * Les briques de saisie partagées par les deux formulaires.
 *
 * L'APPARENCE N'EST PLUS ICI. Elle vit dans `app/globals.css`, sous les classes
 * `champ`, `bouton-*`, `carte` : une chaîne d'utilitaires exportée depuis un
 * composant reste une chaîne recopiée, et deux formulaires qui la recopient
 * finissent par diverger. Ce module ne garde que la structure — l'étiquette,
 * le champ, l'aide — et la ligne de résultat.
 */

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

/**
 * Une ligne de résultat, avec le calcul qui l'a produite.
 *
 * Règle du projet, apprise d'un test réel : un chiffre affiché seul se lit comme
 * une affirmation, et une affirmation surprenante se lit comme une erreur. Un
 * livreur qui saisit 8,08 € pour 30 minutes et voit « 16,16 €/h » croit que son
 * prix a été doublé. Montrer « 8,08 € en 30 min » à côté lève le doute sans
 * qu'il ait à demander.
 */
export function Ligne({
  intitule,
  valeur,
  calcul,
  accent = false,
}: {
  intitule: string;
  valeur: string | null;
  calcul?: string | null;
  accent?: boolean;
}) {
  if (valeur === null) return null;

  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <dt className="text-sm text-neutral-700">{intitule}</dt>
        {calcul ? <dd className="text-xs text-neutral-500">{calcul}</dd> : null}
      </div>
      <dd
        className={`shrink-0 font-mono tabular-nums ${
          accent ? "text-2xl font-semibold text-neutral-900" : "text-sm text-neutral-800"
        }`}
      >
        {valeur}
      </dd>
    </div>
  );
}
