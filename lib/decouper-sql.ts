/**
 * Découpe un fichier SQL en instructions.
 *
 * Un point-virgule ne termine une instruction que s'il est au premier niveau :
 * dans une chaîne, dans un commentaire ou dans un bloc `$$ ... $$`, il fait
 * partie du texte. Or `sql/schema.sql` porte justement des blocs `do $$`, dont
 * les migrations conditionnelles ont besoin — découper naïvement les couperait
 * en deux moitiés invalides.
 *
 * Module pur, pour que le découpage se teste sans base de données.
 */

const BALISE_DOLLAR = /^\$[A-Za-z_]*\$/;

export const decouperSql = (source: string): string[] => {
  const instructions: string[] = [];
  let courante = "";
  let index = 0;

  let dansChaine = false;
  let dansCommentaire = false;
  let baliseOuverte: string | null = null;

  while (index < source.length) {
    const caractere = source[index];
    const reste = source.slice(index);

    if (dansCommentaire) {
      dansCommentaire = caractere !== "\n";
      courante += caractere;
      index += 1;
      continue;
    }

    if (dansChaine) {
      courante += caractere;
      index += 1;
      /* Une apostrophe doublée est une apostrophe littérale, pas une fermeture. */
      if (caractere === "'") {
        if (source[index] === "'") {
          courante += "'";
          index += 1;
        } else {
          dansChaine = false;
        }
      }
      continue;
    }

    if (baliseOuverte !== null) {
      if (reste.startsWith(baliseOuverte)) {
        courante += baliseOuverte;
        index += baliseOuverte.length;
        baliseOuverte = null;
      } else {
        courante += caractere;
        index += 1;
      }
      continue;
    }

    if (reste.startsWith("--")) {
      dansCommentaire = true;
      courante += caractere;
      index += 1;
      continue;
    }

    if (caractere === "'") {
      dansChaine = true;
      courante += caractere;
      index += 1;
      continue;
    }

    const balise = BALISE_DOLLAR.exec(reste);
    if (balise !== null) {
      baliseOuverte = balise[0];
      courante += balise[0];
      index += balise[0].length;
      continue;
    }

    if (caractere === ";") {
      instructions.push(courante.trim());
      courante = "";
      index += 1;
      continue;
    }

    courante += caractere;
    index += 1;
  }

  if (courante.trim() !== "") instructions.push(courante.trim());

  /* Une instruction réduite à des commentaires n'a rien à exécuter. */
  return instructions.filter((instruction) =>
    instruction
      .split("\n")
      .some((ligne) => ligne.trim() !== "" && !ligne.trim().startsWith("--"))
  );
};
