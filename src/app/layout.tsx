import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// opsz is Fraunces' optical-size axis; without it the display face keeps its
// body-text proportions at heading sizes.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  // Was the repository name, which is what the browser tab and every shared
  // link showed. The product is called Note IA everywhere else.
  title: "Note IA",
  description:
    "Enregistre ton cours, la transcription arrive en direct et la fiche de révision s'écrit toute seule.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased motion-safe:scroll-smooth`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
