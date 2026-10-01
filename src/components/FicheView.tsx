'use client';

import { useId, type ReactNode } from 'react';

/* ------------------------------------------------------------------
   Ce que l'IA produit : du JSON pur, aucune mise en forme.
   Toutes les clés sauf titre/sections sont facultatives — si l'IA en
   omet une, la section correspondante ne s'affiche simplement pas.
------------------------------------------------------------------ */

export type Marque = 'prof' | 'cle' | 'pratique';

export type Bloc = {
  texte: string;
  terme?: string;
  marque?: Marque | null;
  /** citation littérale du prof, vérifiée contre le transcript avant stockage */
  signal?: string;
};

export type Section = {
  titre: string;
  niveau?: 2 | 3;
  blocs: Bloc[];
};

/** Une partie du cours. Presque toujours une seule par fiche ; plusieurs
    quand l'enregistrement couvre des cours distincts. */
export type Chapitre = {
  titre: string;
  sections: Section[];
  prioritaire?: string[];
};

export type Fiche =
  | { suffisant: false; message: string }
  | {
      suffisant?: true;
      titre: string;
      chapitres: Chapitre[];
      pratique?: string[];
      /** fiches d'avant les chapitres uniquement : l'IA ne l'écrit plus */
      reserves?: string[];
    };

type Props = {
  fiche: Fiche;
  /* ces quatre-là, tu les as déjà : ils ne coûtent aucun token */
  matiere?: string;
  dureeSecondes?: number;
  nbMotsTranscrits?: number;
  creeLe?: string | Date;
};

/* ---------- valeurs calculées, gratuites ---------- */

const dureeLabel = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

const tousLesBlocs = (chapitres: Chapitre[]) =>
  chapitres.flatMap((c) => c.sections).flatMap((s) => s.blocs);

const tempsLecture = (texte: string) =>
  Math.max(1, Math.round(texte.split(/\s+/).length / 200));

/* teinte stable dérivée du nom de la matière — aucune table à maintenir */
const TEINTES = [
  { bg: '#F3E4D3', fg: '#8A5A34' },
  { bg: '#E4EADC', fg: '#4F6340' },
  { bg: '#DEE5EC', fg: '#42596E' },
  { bg: '#EFE0E6', fg: '#7A4258' },
  { bg: '#EDE6D6', fg: '#6B5A2E' },
];
const teinte = (nom?: string) => {
  if (!nom) return TEINTES[0];
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return TEINTES[h % TEINTES.length];
};

/* années mises en valeur + (?) d'incertitude rendu proprement — regex, pas d'IA */
const rich = (texte: string): ReactNode[] => {
  const out: ReactNode[] = [];
  const re = /\b(1[0-9]{3}|20[0-9]{2})\b|\(\?\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) {
    if (m.index > last) out.push(texte.slice(last, m.index));
    out.push(
      m[0] === '(?)' ? (
        <abbr className="fic-doute" title="Transcription incertaine" key={m.index}>
          ?
        </abbr>
      ) : (
        <b className="fic-annee" key={m.index}>
          {m[0]}
        </b>
      )
    );
    last = m.index + m[0].length;
  }
  if (last < texte.length) out.push(texte.slice(last));
  return out;
};

const dateCourte = (d: string | Date) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const ROMAIN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/* ------------------------------------------------------------------ */

export default function FicheView({
  fiche,
  matiere,
  dureeSecondes,
  nbMotsTranscrits,
  creeLe,
}: Props) {
  const uid = useId().replace(/:/g, '');

  if (fiche.suffisant === false) {
    return (
      <div className="fic fic-vide">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <h1 className="fic-titre">Fiche non générée</h1>
        <div className="fic-rule" />
        <p>{fiche.message}</p>
        <p className="fic-vide-note">
          L’enregistrement est conservé, et cette tentative ne compte pas dans tes
          fiches gratuites. Une seule génération est possible par enregistrement :
          pour tes prochains cours, enregistre la séance en entier.
        </p>
      </div>
    );
  }

  const t = teinte(matiere);
  const blocs = tousLesBlocs(fiche.chapitres);
  const nbSignales = blocs.filter((b) => b.marque === 'prof').length;
  const nbDefinitions = blocs.filter((b) => b.terme).length;

  const texteIntegral = [
    ...blocs.map((b) => `${b.terme ?? ''} ${b.texte}`),
    ...fiche.chapitres.flatMap((c) => c.prioritaire ?? []),
    ...(fiche.pratique ?? []),
  ].join(' ');

  return (
    <article className="fic">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* en-tête */}
      <header className="fic-head">
        {matiere && (
          <span className="fic-matiere" style={{ background: t.bg, color: t.fg }}>
            {matiere}
          </span>
        )}
        <h1 className="fic-titre">{fiche.titre}</h1>
        <div className="fic-rule" />
        {creeLe && <p className="fic-meta">Généré le {dateCourte(creeLe)}</p>}
      </header>

      {/* chiffres calculés — aucun token */}
      <div className="fic-stats">
        {dureeSecondes != null && (
          <div className="fic-stat">
            <b>{dureeLabel(dureeSecondes)}</b>
            <span>de cours</span>
          </div>
        )}
        {nbMotsTranscrits != null && (
          <div className="fic-stat">
            <b>{nbMotsTranscrits.toLocaleString('fr-FR')}</b>
            <span>mots transcrits</span>
          </div>
        )}
        <div className="fic-stat">
          <b>{blocs.length}</b>
          <span>notes</span>
        </div>
        {nbDefinitions > 0 && (
          <div className="fic-stat">
            <b>{nbDefinitions}</b>
            <span>définitions</span>
          </div>
        )}
        {nbSignales > 0 && (
          <div className="fic-stat fic-stat-alerte">
            <b>{nbSignales}</b>
            <span>signalés en cours</span>
          </div>
        )}
        <div className="fic-stat">
          <b>{tempsLecture(texteIntegral)} min</b>
          <span>de relecture</span>
        </div>
      </div>

      {/* Un seul chapitre (le cas normal) : rendu tel quel, sans titre de
          chapitre, le titre de la fiche suffit. Plusieurs : chacun dans son
          bloc, sous son propre grand titre, avec son plan numéroté à partir
          de I et son « À retenir en priorité ». */}
      {fiche.chapitres.length === 1 ? (
        <ChapitreContenu
          chapitre={fiche.chapitres[0]}
          idBase={`${uid}-c0`}
          libellePlan="Plan du cours"
        />
      ) : (
        fiche.chapitres.map((c, ci) => (
          <section key={`${c.titre}-${ci}`} className="fic-chap" aria-labelledby={`${uid}-c${ci}-titre`}>
            <header className="fic-chap-head">
              <span className="fic-chap-num">Chapitre {ci + 1}</span>
              <h2 id={`${uid}-c${ci}-titre`} className="fic-chap-titre">
                {rich(c.titre)}
              </h2>
            </header>
            <ChapitreContenu chapitre={c} idBase={`${uid}-c${ci}`} libellePlan="Plan du chapitre" />
          </section>
        ))
      )}

      {/* informations pratiques — jamais mêlées au contenu académique */}
      {!!fiche.pratique?.length && (
        <section className="fic-pratique">
          <h2 className="fic-label">Informations pratiques</h2>
          <ul>
            {fiche.pratique.map((p) => (
              <li key={p}>{rich(p)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* réserves sur le cours ou la transcription */}
      {!!fiche.reserves?.length && (
        <footer className="fic-reserves">
          <h2 className="fic-label-sobre">Ce qui n’a pas été dit clairement</h2>
          <ul>
            {fiche.reserves.map((r) => (
              <li key={r}>{rich(r)}</li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}

/* Plan numéroté, notes détaillées et « À retenir » d'un chapitre. La
   numérotation repart de I à chaque chapitre ; idBase rend les ancres
   uniques d'un chapitre à l'autre. */
function ChapitreContenu({
  chapitre,
  idBase,
  libellePlan,
}: {
  chapitre: Chapitre;
  idBase: string;
  libellePlan: string;
}) {
  return (
    <>
      {/* plan du cours, numéroté à partir des sections elles-mêmes : il
          correspond toujours aux notes affichées en dessous, et chaque
          entrée mène à sa section. */}
      {chapitre.sections.length > 0 && (
        <nav className="fic-sec" aria-label={libellePlan}>
          <h2 className="fic-label">{libellePlan}</h2>
          <ol className="fic-plan">
            {chapitre.sections.map((s, i) => (
              <li key={`${s.titre}-${i}`}>
                <a
                  href={`#${idBase}-s${i}`}
                  className="fic-plan-lien"
                  onClick={(e) => {
                    // scrollIntoView rather than the bare hash: useId's
                    // characters are not always safe in a URL fragment.
                    const cible = document.getElementById(`${idBase}-s${i}`);
                    if (!cible) return;
                    e.preventDefault();
                    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    cible.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
                  }}
                >
                  <span className="fic-num">{ROMAIN[i] ?? i + 1}.</span>
                  <span>{rich(s.titre)}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* notes détaillées */}
      <div className="fic-notes">
        {chapitre.sections.map((s, i) => {
          const n = s.niveau ?? 2;
          return (
            <section key={`${s.titre}-${i}`} id={`${idBase}-s${i}`} className={`fic-part fic-n${n}`}>
              {n === 2 ? (
                <h2 className="fic-h2">{s.titre}</h2>
              ) : (
                <h3 className="fic-h3">{s.titre}</h3>
              )}
              <ul className="fic-blocs">
                {s.blocs.map((b, j) => (
                  <li key={j} className={`fic-bloc${b.marque ? ` fic-m-${b.marque}` : ''}`}>
                    <span className="fic-puce" aria-hidden="true">
                      {b.marque === 'pratique' ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 17v5" />
                          <path d="M9 10.76V6h6v4.76a2 2 0 0 0 .59 1.42L17 13.6V17H7v-3.4l1.41-1.42A2 2 0 0 0 9 10.76z" />
                        </svg>
                      ) : null}
                    </span>
                    <div className="fic-bloc-corps">
                      {b.marque === 'prof' && (
                        <span className="fic-badge">Signalé en cours</span>
                      )}
                      {b.marque === 'prof' && b.signal && (
                        <p className="fic-citation">« {b.signal} »</p>
                      )}
                      <p>
                        {b.terme && <b className="fic-terme">{b.terme}</b>}
                        {b.terme && <span className="fic-tiret"> — </span>}
                        {rich(b.texte)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* ce qu'il faut retenir en priorité — clôt le contenu académique */}
      {!!chapitre.prioritaire?.length && (
        <section className="fic-prio">
          <h2 className="fic-label">À retenir en priorité</h2>
          <ul>
            {chapitre.prioritaire.map((p) => (
              <li key={p}>{rich(p)}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const CSS = `
.fic{--f-surface:#FFFFFF;--f-ink:#2B211A;--f-muted:#6B5D4F;--f-faint:#9C8E7D;--f-accent:#D97757;--f-deep:#C4622D;--f-soft:#F3E4D3;--f-line:#EDE0CE;--f-alerte:#C0412C;--f-alerte-bg:#FDF1ED;--f-display:'Fraunces',Georgia,serif;--f-body:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-family:var(--f-body);color:var(--f-ink);background:var(--f-surface);
  max-width:720px;margin:0 auto;padding:clamp(20px,5vw,44px);
  display:flex;flex-direction:column;gap:30px}
.fic *{box-sizing:border-box}
.fic p{margin:0}

/* en-tête */
.fic-head{display:flex;flex-direction:column;gap:11px}
.fic-matiere{align-self:flex-start;border-radius:999px;padding:5px 13px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.fic-titre{font-family:var(--f-display);font-size:clamp(27px,5vw,36px);font-weight:600;line-height:1.12;margin:0;text-wrap:balance}
.fic-rule{width:54px;height:2.5px;border-radius:2px;background:var(--f-accent)}
.fic-meta{font-size:13.5px;color:var(--f-faint)}

/* chiffres */
.fic-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:9px}
.fic-stat{background:var(--f-soft);border-radius:12px;padding:11px 14px;display:flex;flex-direction:column;gap:2px}
.fic-stat b{font-family:var(--f-display);font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1}
.fic-stat span{font-size:11.5px;font-weight:600;letter-spacing:.03em;color:#8A5A34}
.fic-stat-alerte{background:var(--f-alerte-bg)}
.fic-stat-alerte b{color:var(--f-alerte)}
.fic-stat-alerte span{color:var(--f-alerte);opacity:.82}

/* libellés de section */
.fic-label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--f-deep);margin:0}
.fic-label-sobre{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--f-faint);margin:0}

/* l'essentiel */
.fic-prio{background:linear-gradient(180deg,#FFFCF7 0%,#FCF4EA 100%);border:1px solid var(--f-line);border-radius:16px;padding:20px 22px;display:flex;flex-direction:column;gap:13px}
.fic-prio ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:11px}
.fic-prio li{font-size:15.5px;line-height:1.6;display:flex;gap:11px}
.fic-prio li::before{content:'';flex:none;width:6px;height:6px;border-radius:50%;background:var(--f-accent);margin-top:8px}

/* sommaire */

/* plan */
.fic-sec{display:flex;flex-direction:column;gap:13px}
.fic-plan{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.fic-plan li{font-size:15.5px;line-height:1.5}
.fic-plan-lien{display:flex;gap:13px;color:inherit;text-decoration:none;border-radius:6px;transition:color .16s ease}
.fic-plan-lien:hover{color:var(--f-deep)}
.fic-plan-lien:hover>span:last-child{text-decoration:underline;text-underline-offset:3px}
.fic-plan-lien:focus-visible{outline:2px solid var(--f-accent);outline-offset:3px}
.fic-num{flex:none;font-family:var(--f-display);font-size:14px;font-weight:700;color:var(--f-deep);min-width:28px;padding-top:1px;font-variant-numeric:tabular-nums}

/* notes détaillées */
.fic-notes{display:flex;flex-direction:column;gap:28px}

/* chapitres, quand la fiche en a plusieurs */
.fic-chap{display:flex;flex-direction:column;gap:30px;padding-top:30px;border-top:2px solid var(--f-line)}
.fic-chap-head{display:flex;flex-direction:column;gap:6px}
.fic-chap-num{font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--f-accent)}
.fic-chap-titre{font-family:var(--f-display);font-size:clamp(23px,4.2vw,29px);font-weight:600;line-height:1.15;margin:0;text-wrap:balance;color:var(--f-deep)}
.fic-part{display:flex;flex-direction:column;gap:14px;scroll-margin-top:24px}
.fic-n3{padding-left:16px;border-left:1px solid var(--f-line);margin-top:-8px}
.fic-h2{font-family:var(--f-display);font-size:21px;font-weight:600;line-height:1.25;margin:0;text-wrap:balance}
.fic-h3{font-family:var(--f-display);font-size:16.5px;font-weight:600;line-height:1.3;margin:0;color:var(--f-muted)}

.fic-blocs{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
.fic-bloc{display:flex;gap:11px;align-items:flex-start}
.fic-bloc p{font-size:15.5px;line-height:1.62}
.fic-bloc-corps{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.fic-puce{flex:none;width:18px;height:18px;margin-top:4px;display:flex;align-items:center;justify-content:center;color:var(--f-deep)}
.fic-puce::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--f-line)}
.fic-bloc.fic-m-pratique .fic-puce::before,.fic-bloc.fic-m-cle .fic-puce::before{display:none}

/* note repérée par l'IA comme structurellement centrale */
.fic-m-cle{border-left:2.5px solid var(--f-accent);padding-left:13px;margin-left:2px}
.fic-m-cle .fic-puce{display:none}

/* information pratique surgie en cours de route */
.fic-m-pratique{background:#FAF6F0;border-radius:11px;padding:11px 13px}
.fic-m-pratique p{font-size:14.5px;color:var(--f-muted)}

/* signalé explicitement par le professeur — le traitement le plus fort */
.fic-m-prof{background:var(--f-alerte-bg);border-left:3px solid var(--f-alerte);border-radius:0 12px 12px 0;padding:13px 16px}
.fic-m-prof .fic-puce{display:none}
.fic-badge{align-self:flex-start;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--f-alerte)}
.fic-citation{font-size:13px;line-height:1.5;font-style:italic;color:var(--f-alerte);opacity:.78;margin:-2px 0 2px}

.fic-terme{font-weight:600;color:var(--f-ink)}
.fic-tiret{color:var(--f-faint)}

/* informations pratiques */
.fic-pratique{border:1px dashed var(--f-line);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:12px}
.fic-pratique ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.fic-pratique li{font-size:14.5px;line-height:1.55;color:var(--f-muted);display:flex;gap:10px}
.fic-pratique li::before{content:'\\2022';color:var(--f-accent);flex:none;font-weight:700}

/* réserves */
.fic-reserves{border-top:1px solid var(--f-line);padding-top:18px;display:flex;flex-direction:column;gap:10px}
.fic-reserves ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.fic-reserves li{font-size:13.5px;line-height:1.55;color:var(--f-faint)}

/* marqueurs dérivés du texte */
.fic-annee{font-weight:600;color:var(--f-deep);font-variant-numeric:tabular-nums;background:rgba(217,119,87,.11);border-radius:4px;padding:0 3px;margin:0 -1px}
.fic-doute{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;border:1px solid var(--f-faint);color:var(--f-faint);font-size:10px;font-weight:700;vertical-align:1px;margin-left:3px;text-decoration:none;cursor:help}

/* fiche non générée */
.fic-vide{gap:14px;text-align:left}
.fic-vide p{font-size:15.5px;line-height:1.6;color:var(--f-muted)}
.fic-vide-note{font-size:13.5px;color:var(--f-faint)}

@media print{
  .fic{max-width:none;padding:0;gap:22px}
  .fic-part,.fic-prio,.fic-pratique,.fic-bloc{break-inside:avoid}
}
`;
