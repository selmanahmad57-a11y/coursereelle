import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-50">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto flex max-w-3xl items-baseline gap-6 px-4 py-4">
            <Link className="font-semibold text-neutral-900" href="/">
              Course Réelle
            </Link>
            <Link className="text-sm text-neutral-600 hover:text-neutral-900" href="/methode">
              Méthode
            </Link>
          </nav>
        </header>

        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
