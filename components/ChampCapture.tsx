"use client";

import { useState } from "react";

import libelles from "@/config/libelles.json";
import {
  contraintesCapture,
  decisionCaptures,
  descriptionContraintes,
  formatsRefuses,
} from "@/lib/parametres";
import {
  controlerCapture,
  formatRefuseReconnu,
  type RefusCapture,
} from "@/lib/validation/capture.ts";

const textes = libelles.formulaire.capture;
const motifs = libelles.motifs_capture as Record<string, string>;

interface Selection {
  nom: string;
  apercu: string;
}

export default function ChampCapture({
  dateCourse,
  onChange,
}: {
  dateCourse: string;
  onChange?: (fichier: File | null) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [refus, setRefus] = useState<RefusCapture | null>(null);
  const [expliquerFormat, setExpliquerFormat] = useState<string | null>(null);

  const contraintes = contraintesCapture(dateCourse);
  const description = descriptionContraintes(dateCourse);

  const oublier = () => {
    /* Libérer l'URL de l'aperçu précédent : sans cela chaque essai fuit une image. */
    setSelection((precedente) => {
      if (precedente) URL.revokeObjectURL(precedente.apercu);
      return null;
    });
  };

  const choisir = (fichier: File | null) => {
    oublier();
    setRefus(null);
    setExpliquerFormat(null);

    if (fichier === null) {
      onChange?.(null);
      return;
    }

    const propose = { type: fichier.type, nom: fichier.name, taille: fichier.size };
    const probleme = controlerCapture(propose, contraintes);

    if (probleme !== null) {
      setRefus(probleme);

      /* Expliquer POURQUOI, quand le format est un cas connu — quelqu'un qui a
         photographié son écran de bonne foi mérite mieux qu'un refus sec. */
      const reconnu = formatRefuseReconnu(propose, formatsRefuses);
      if (reconnu) {
        setExpliquerFormat(
          (decisionCaptures as Record<string, string>)[reconnu.cle_explication] ?? null
        );
      }

      onChange?.(null);
      return;
    }

    setSelection({ nom: fichier.name, apercu: URL.createObjectURL(fichier) });
    onChange?.(fichier);
  };

  return (
    <div>
      <p className="block text-sm font-medium text-neutral-800">{textes.intitule}</p>
      <p className="mt-1 text-xs text-neutral-600">{textes.aide}</p>

      <label
        className="mt-2 inline-block cursor-pointer rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:border-neutral-900"
        htmlFor="capture"
      >
        {selection ? textes.remplacer : textes.bouton}
      </label>
      <input
        accept={description.typesMime}
        className="sr-only"
        id="capture"
        name="capture"
        onChange={(evenement) => choisir(evenement.target.files?.[0] ?? null)}
        type="file"
      />

      <dl className="mt-2 space-y-0.5 text-xs text-neutral-600">
        <div className="flex gap-2">
          <dt>{textes.formats_acceptes} :</dt>
          <dd>{description.formats}</dd>
        </div>
        {description.taille ? (
          <div className="flex gap-2">
            <dt>{textes.taille_acceptee} :</dt>
            <dd>{description.taille}</dd>
          </div>
        ) : null}
      </dl>

      {refus ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-900">
            {motifs[refus.motif] ?? refus.motif}
          </p>
          {expliquerFormat ? (
            <p className="mt-1 text-sm text-amber-900">{expliquerFormat}</p>
          ) : null}
          {refus.motif === "format_non_pris_en_charge" && !expliquerFormat ? (
            <p className="mt-1 text-sm text-amber-900">{textes.heic}</p>
          ) : null}
        </div>
      ) : null}

      {selection ? (
        <figure className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local d'un blob, jamais servi par Next */}
          <img
            alt={textes.apercu}
            className="max-h-64 w-auto rounded-md border border-neutral-200"
            src={selection.apercu}
          />
          <figcaption className="mt-1 flex items-center gap-3 text-xs text-neutral-600">
            <span className="truncate">{selection.nom}</span>
            <button
              className="shrink-0 underline underline-offset-2 hover:text-neutral-900"
              onClick={() => {
                oublier();
                onChange?.(null);
              }}
              type="button"
            >
              {textes.retirer}
            </button>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
