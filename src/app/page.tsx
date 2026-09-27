import Link from "next/link";

const NAV_LINKS = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "Comment ça marche", href: "#comment-ca-marche" },
];

const STEPS = [
  {
    title: "1. Vous appuyez sur écouter",
    body: "Un bouton simple, discret, posé dans un coin. Pas de gros voyant rouge qui vous stresse — juste une petite pulsation douce qui confirme que ça enregistre.",
    icon: <MicIcon className="h-[22px] w-[22px]" />,
  },
  {
    title: "2. Vous écoutez, elle transcrit",
    body: "La transcription se fait en direct, en arrière-plan. Vous choisissez si vous voulez la voir défiler à l'écran ou simplement faire confiance et rester concentré sur le cours.",
    icon: <BookIcon className="h-[22px] w-[22px]" />,
  },
  {
    title: "3. Votre fiche est prête",
    body: "Résumé, points clés, définitions — organisés et prêts à réviser, générés automatiquement dès la fin du cours.",
    icon: <CheckListIcon className="h-[22px] w-[22px]" />,
  },
];

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function CheckListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export default function Home() {
  return (
    // The palette is light-only, so the background is set here rather than
    // inherited from body, which still flips under prefers-color-scheme: dark.
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="flex items-center justify-between gap-3 px-5 py-6 sm:gap-6 sm:px-8 lg:px-20 lg:py-7">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-terracotta text-cream">
            <MicIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="whitespace-nowrap font-display text-[22px] font-semibold">
            Note IA
          </span>
        </Link>

        <nav className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3.5">
          <Link
            href="/login"
            className="hidden px-4 py-2.5 text-[15px] font-medium text-ink transition-colors hover:text-terracotta-deep sm:block"
          >
            Se connecter
          </Link>
          <Link
            href="/login"
            className="shrink-0 whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 sm:px-5 sm:text-[15px]"
          >
            {/* The full label does not fit beside the logo on a phone. */}
            <span className="sm:hidden">Commencer</span>
            <span className="hidden sm:inline">Commencer gratuitement</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-col">
        <section className="flex flex-col items-center gap-6 px-5 pt-12 pb-14 text-center sm:px-8 lg:px-20 lg:pt-[72px]">
          <p className="inline-flex items-center gap-2 rounded-full bg-sand px-4 py-2">
            <span className="h-[7px] w-[7px] rounded-full bg-terracotta-deep" />
            <span className="text-[13px] font-semibold text-clay">
              Fait pour les étudiants français
            </span>
          </p>

          <h1 className="max-w-[820px] font-display text-4xl font-medium leading-[1.12] sm:text-5xl lg:text-[64px] lg:leading-[1.08]">
            Vos cours, transformés en fiches claires, sans lever un stylo
          </h1>

          <p className="text-lg font-semibold leading-snug text-terracotta-deep sm:text-[21px]">
            Prenez les mêmes notes que le meilleur élève de votre promo
          </p>

          <p className="max-w-[560px] text-base leading-relaxed text-ink-soft sm:text-[19px]">
            Note IA enregistre votre cours, le transcrit en direct, puis génère
            une fiche structurée avec résumé, points clés et définitions.
            Pendant que vous écoutez, elle travaille pour vous.
          </p>

          <div className="mt-2 flex w-full flex-col items-stretch gap-3.5 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 rounded-full bg-terracotta px-7 py-4 text-base font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Essayer gratuitement
              <ArrowIcon />
            </Link>
            <a
              href="#demo"
              className="flex items-center justify-center gap-2.5 rounded-full border-[1.5px] border-line px-6 py-4 text-base font-semibold text-ink transition-colors hover:bg-sand"
            >
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-cream">
                <PlayIcon className="h-[9px] w-[9px]" />
              </span>
              Voir la démo
            </a>
          </div>
        </section>

        <section id="demo" className="px-5 pb-20 sm:px-8 lg:px-20 lg:pb-24">
          <div className="mx-auto w-full max-w-[1100px]">
            <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-sand to-sand-deep shadow-[0_30px_70px_-20px_rgba(139,90,52,0.35)]">
              <div className="flex flex-col items-center gap-5 px-6 text-center">
                {/* Placeholder until the demo video is available. */}
                <button
                  type="button"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-cream shadow-[0_12px_30px_rgba(43,33,26,0.3)] transition-transform hover:scale-105 sm:h-[84px] sm:w-[84px]"
                  aria-label="Lire la vidéo de démonstration"
                >
                  <PlayIcon className="h-5 w-5 sm:h-[26px] sm:w-[26px]" />
                </button>
                <div>
                  <p className="font-display text-lg font-medium sm:text-xl">
                    Voir Note IA en action
                  </p>
                  <p className="mt-1 text-[13px] text-clay sm:text-sm">
                    1 min 40 — enregistrement, transcription, fiche générée
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="comment-ca-marche"
          className="flex flex-col items-center gap-12 bg-cream-deep px-5 py-20 sm:px-8 lg:gap-14 lg:px-20 lg:py-24"
        >
          <div className="flex flex-col gap-3.5 text-center">
            <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-terracotta-deep">
              Comment ça marche
            </span>
            <h2 className="font-display text-3xl font-medium sm:text-[38px]">
              Trois étapes, zéro effort
            </h2>
          </div>

          <ul className="grid w-full max-w-[1160px] gap-7 md:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.title}
                className="flex flex-col gap-[18px] rounded-[20px] bg-cream p-8 lg:px-8 lg:py-9"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-sand text-terracotta-deep">
                  {step.icon}
                </span>
                <h3 className="font-display text-xl font-medium">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col items-center gap-5 px-5 py-20 text-center sm:px-8 lg:px-20 lg:py-24">
          <h2 className="max-w-[600px] font-display text-3xl font-medium sm:text-[40px]">
            Prêt à ne plus jamais rater une note de cours ?
          </h2>
          <p className="text-base text-ink-soft">
            Gratuit pour commencer. Aucune carte bancaire requise.
          </p>
          <Link
            href="/login"
            className="mt-2 rounded-full bg-terracotta px-8 py-4 text-base font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Créer mon compte
          </Link>
        </section>
      </main>
    </div>
  );
}
