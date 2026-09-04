import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import libelles from "@/config/libelles.json";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Course Réelle",
    template: "%s · Course Réelle",
  },
  description:
    "Les courses réelles des livreurs, vérifiées automatiquement, pour mesurer l'écart entre les annonces des plateformes et la réalité du terrain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { navigation } = libelles;

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-50 font-sans text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto max-w-3xl px-4 py-3">
            <Link className="font-semibold text-neutral-900" href="/">
              {navigation.marque}
            </Link>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {navigation.liens.map((lien) => (
                <Link
                  key={lien.href}
                  className="text-xs text-neutral-600 hover:text-mesure sm:text-sm"
                  href={lien.href}
                >
                  {lien.libelle}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="mt-16 border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-6">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {navigation.pied.liens.map((lien) => (
                <li key={lien.href}>
                  <Link
                    className="text-sm text-neutral-600 hover:text-neutral-900"
                    href={lien.href}
                  >
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-neutral-600">{navigation.pied.mention}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
