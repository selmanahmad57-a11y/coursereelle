"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { accesAutorise, jetonAcces, NOM_COOKIE } from "@/lib/surveillance.ts";

const UNE_JOURNEE_EN_SECONDES = 60 * 60 * 24;

export async function ouvrirSurveillance(donnees: FormData) {
  const fourni = String(donnees.get("motdepasse") ?? "");
  const attendu = process.env.SURVEILLANCE_PASSWORD;

  if (!accesAutorise(fourni, attendu)) {
    redirect("/surveillance?refus=1");
  }

  const jar = await cookies();
  jar.set(NOM_COOKIE, await jetonAcces(attendu as string), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/surveillance",
    maxAge: UNE_JOURNEE_EN_SECONDES,
  });

  redirect("/surveillance");
}
