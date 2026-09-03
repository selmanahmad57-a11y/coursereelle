/**
 * Tests du decoupage d'un fichier SQL en instructions.
 *
 * Usage : node --test 'tests/**\/*.test.mjs'
 *
 * Le schema porte des blocs `do $$ ... $$`, dont les migrations
 * conditionnelles ont besoin. Un decoupage naif sur le point-virgule les
 * couperait en moities invalides — et le probleme ne se verrait qu'a
 * l'execution, sur la vraie base, au pire moment.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { decouperSql } from "../lib/decouper-sql.ts";

test("un bloc dollar reste entier malgre ses points-virgules", () => {
  const source = `
    create table t (a int);

    do $$
    begin
      if not exists (select 1 from t) then
        insert into t values (1);
      end if;
    end $$;

    create index i on t (a);
  `;

  const instructions = decouperSql(source);

  assert.equal(instructions.length, 3);
  assert.ok(instructions[1].startsWith("do $$"));
  assert.ok(instructions[1].includes("end $$"), "le bloc a ete coupe en deux");
});

test("un point-virgule dans une chaine ne termine rien", () => {
  const instructions = decouperSql("insert into t values ('a;b'); select 1;");

  assert.equal(instructions.length, 2);
  assert.ok(instructions[0].includes("'a;b'"));
});

test("une apostrophe doublee ne ferme pas la chaine", () => {
  const instructions = decouperSql("insert into t values ('l''eau; froide'); select 1;");

  assert.equal(instructions.length, 2);
});

test("un point-virgule en commentaire ne termine rien", () => {
  const instructions = decouperSql("-- un point-virgule ; ici\nselect 1;");

  assert.equal(instructions.length, 1);
});

test("une instruction faite de commentaires seuls n'est pas executee", () => {
  /* Sinon le dernier commentaire du fichier partirait a la base comme une
     instruction vide, et l'application echouerait sur rien. */
  assert.deepEqual(decouperSql("-- rien du tout\n\n-- vraiment rien\n"), []);
});

test("le schema reel se decoupe sans couper aucun bloc", async () => {
  const source = await readFile("sql/schema.sql", "utf8");
  const instructions = decouperSql(source);

  assert.ok(instructions.length > 0, "le schema doit produire des instructions");

  const blocs = instructions.filter((instruction) => instruction.includes("do $$"));
  assert.ok(blocs.length > 0, "le schema porte des blocs conditionnels");

  for (const bloc of blocs) {
    assert.ok(bloc.includes("end $$"), `bloc coupe : ${bloc.slice(0, 60)}`);
  }

  /* Autant de blocs ouverts dans le fichier que de blocs entiers apres decoupage. */
  assert.equal(blocs.length, source.split("do $$").length - 1);
});
