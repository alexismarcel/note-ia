import { Suspense } from "react";
import Link from "next/link";
import GoogleSignIn from "./google-sign-in";

function MicIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-between gap-10 bg-cream px-5 py-10 text-ink">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-terracotta text-cream">
          <MicIcon />
        </span>
        <span className="font-display text-[19px] font-semibold">Note IA</span>
      </Link>

      <main className="flex w-full max-w-[420px] flex-col items-center gap-8 rounded-3xl border border-line-soft bg-white px-7 py-12 shadow-[0_20px_60px_-15px_rgba(139,90,52,0.18)] sm:px-11 sm:py-14">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <h1 className="font-display text-[28px] font-medium">
            Bon retour parmi nous
          </h1>
          <p className="text-[15px] leading-normal text-ink-soft">
            Connectez-vous pour retrouver vos fiches de cours
          </p>
        </div>

        <Suspense
          fallback={
            <div
              className="h-[52px] w-full rounded-[14px] border-[1.5px] border-line-warm bg-white"
              aria-hidden="true"
            />
          }
        >
          <GoogleSignIn />
        </Suspense>

        <p className="text-center text-[12.5px] leading-relaxed text-ink-faint">
          En continuant, vous acceptez nos conditions d&apos;utilisation et
          notre politique de confidentialité.
        </p>
      </main>

      <p className="text-center text-[13px] text-ink-faint">
        Nouveau ici ? La connexion crée automatiquement votre compte.
      </p>
    </div>
  );
}
