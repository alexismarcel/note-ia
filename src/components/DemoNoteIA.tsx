'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Démo animée de Note IA — 30 s.
 * Affiche une image fixe (la fiche terminée) sous un bouton lecture ; la démo ne se
 * lance qu’au clic, joue une fois, puis revient à l’image fixe.
 * Aucune dépendance, aucun fichier vidéo.
 */
export default function DemoNoteIA() {
  const rootRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const q = (sel: string) => root.querySelector(sel) as HTMLElement;

    const outer = q('.nia-outer');
    const stage = q('.nia-stage');
    const app = q('.nia-app');
    const cursor = q('.nia-cursor');
    const field = q('.nia-field');
    const select = q('.nia-select');
    const selectLabel = q('.nia-select-label');
    const menu = q('.nia-menu');
    const rec = q('.nia-rec');
    const recLabel = q('.nia-rec-label');
    const meter = q('.nia-meter');
    const timer = q('.nia-timer');
    const wave = q('.nia-wave');
    const count = q('.nia-count');
    const placeholder = q('.nia-ph');
    const trWrap = q('.nia-trwrap');
    const transcript = q('.nia-transcript');
    const panel = q('.nia-panel');
    const gen = q('.nia-gen');
    const genFill = q('.nia-gen-fill');
    const sheet = q('.nia-sheet');
    const sheetScroll = q('.nia-sheet-scroll');
    const cut = q('.nia-cut');
    const outro = q('.nia-outro');

    /* ---------- mise à l'échelle ---------- */
    const fit = () => {
      const w = outer.clientWidth;
      const narrow = w < 700;
      const designW = narrow ? 760 : 1280;
      const offset = (1280 - designW) / 2;
      const s = w / designW;
      outer.classList.toggle('nia-narrow', narrow);
      stage.style.transform = `translateX(${-offset * s}px) scale(${s})`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);

    /* ---------- helpers ---------- */
    const moveTo = (x: number, y: number) => {
      cursor.style.transform = `translate(${x}px,${y}px)`;
    };
    const tap = () => {
      cursor.classList.remove('nia-tap');
      void cursor.offsetWidth;
      cursor.classList.add('nia-tap');
    };
    /* place la pointe du curseur au centre réel de l’élément, mesuré dans le DOM */
    const moveToEl = (el: Element) => {
      const sr = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const k = sr.width / 1280;
      if (!k || !r.width) return;
      moveTo((r.left + r.width / 2 - sr.left) / k - 5, (r.top + r.height / 2 - sr.top) / k - 3);
    };
    /* le menu vit dans .nia-app : on l’aligne sous le sélecteur à l’ouverture */
    const items = Array.from(menu.querySelectorAll('.nia-menu-item')) as HTMLElement[];
    const openMenu = () => {
      const k = stage.getBoundingClientRect().width / 1280;
      const ar = app.getBoundingClientRect();
      const sr = select.getBoundingClientRect();
      if (!k) return;
      menu.style.left = `${(sr.left - ar.left) / k - 1}px`;
      menu.style.top = `${(sr.bottom - ar.top) / k - 1 + 8}px`;
      menu.style.width = `${sr.width / k}px`;
      menu.hidden = false;
      select.classList.add('nia-open');
    };
    const hover = (i: number) => {
      items.forEach((el, j) => el.classList.toggle('nia-hot', j === i));
    };
    const press = (i: number) => items[i].classList.add('nia-press');
    const setCount = (n: number) => {
      count.textContent = n.toLocaleString('fr-FR') + (n > 1 ? ' mots' : ' mot');
    };

    let tick: ReturnType<typeof setInterval> | null = null;
    let base = 0;
    let t0 = 0;
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const mm = String(m).padStart(2, '0');
      const ss = String(sec).padStart(2, '0');
      return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
    };
    const startTimer = (offset: number) => {
      base = offset;
      t0 = Date.now();
      tick = setInterval(() => {
        timer.textContent = fmt(base + Math.floor((Date.now() - t0) / 1000));
      }, 250);
    };
    const stopTimer = () => {
      if (tick) {
        clearInterval(tick);
        tick = null;
      }
    };

    /* ---------- timeline ---------- */
    type Step = { t: number; fn: () => void };
    const steps: Step[] = [];
    const at = (t: number, fn: () => void) => steps.push({ t, fn });

    const OPENING =
      'Alors, la révolution industrielle démarre en Angleterre vers 1760. Ce qui change tout, c’est la machine à vapeur de James Watt.';
    const LATER_OLD =
      '… les filatures du Lancashire emploient déjà plusieurs milliers d’ouvriers. Le charbon devient la ressource stratégique du siècle, et c’est là que l’Angleterre prend une avance décisive sur le continent. Troisième point, et on va s’y arrêter un moment : le chemin de fer. La ligne Stockton-Darlington ouvre en 1825, et en vingt-cinq ans le réseau britannique dépasse dix mille kilomètres. Le coût du transport s’effondre, les marchés se mettent à communiquer. ';
    const LATER_NEW =
      'Donc retenez bien ça pour l’examen : l’innovation technique vient d’abord, la transformation sociale suit. Le prolétariat, c’est la conséquence, pas la cause.';

    /* 0 – 4,2 s : choix de la matière */
    at(200, () => {
      cursor.classList.add('nia-show');
      moveTo(760, 470);
    });
    at(600, () => moveToEl(select));
    at(1300, () => {
      tap();
      openMenu();
    });
    at(2000, () => moveToEl(items[0]));
    at(2620, () => hover(0));
    at(3000, () => {
      tap();
      press(0);
    });
    at(3200, () => {
      menu.hidden = true;
      select.classList.remove('nia-open');
      select.classList.add('nia-filled');
      selectLabel.textContent = 'Histoire — Révolution industrielle';
    });
    at(3500, () => moveToEl(rec));

    /* 4,15 s : démarrage */
    at(4150, () => {
      tap();
      rec.classList.add('nia-live');
      recLabel.textContent = 'Arrêter l’enregistrement';
      meter.classList.add('nia-on');
      wave.classList.add('nia-on');
      placeholder.hidden = true;
      trWrap.hidden = false;
      transcript.textContent = '';
      const caret = document.createElement('span');
      caret.className = 'nia-caret';
      transcript.appendChild(caret);
      startTimer(0);
    });
    at(4500, () => moveTo(830, 500));

    /* 4,3 – 9,3 s : 5 secondes d’écoute */
    const words = OPENING.split(' ');
    words.forEach((w, i) => {
      at(4300 + (5000 * i) / words.length, () => {
        const caret = transcript.querySelector('.nia-caret');
        transcript.insertBefore(document.createTextNode((i ? ' ' : '') + w), caret);
        setCount(i + 1);
      });
    });

    /* 9,4 s : la coupure */
    at(9400, () => {
      cursor.classList.remove('nia-show');
      cut.classList.add('nia-in');
    });
    at(9850, () => {
      transcript.innerHTML = '';
      const old = document.createElement('span');
      old.className = 'nia-old';
      old.textContent = LATER_OLD;
      transcript.appendChild(old);
      const caret = document.createElement('span');
      caret.className = 'nia-caret';
      transcript.appendChild(caret);
      stopTimer();
      timer.textContent = '02:04:11';
      setCount(12106);
      startTimer(7451);
    });
    at(10800, () => cut.classList.remove('nia-in'));

    /* 10,9 – 13,1 s : la transcription continue */
    const words2 = LATER_NEW.split(' ');
    words2.forEach((w, i) => {
      at(10900 + (2200 * i) / words2.length, () => {
        const caret = transcript.querySelector('.nia-caret');
        transcript.insertBefore(document.createTextNode((i ? ' ' : '') + w), caret);
        setCount(12106 + i + 1);
      });
    });

    /* 13,25 s : arrêt */
    at(13250, () => {
      cursor.classList.add('nia-show');
      moveToEl(rec);
    });
    at(13900, () => {
      tap();
      rec.classList.remove('nia-live');
      recLabel.textContent = 'Démarrer l’enregistrement';
      wave.classList.remove('nia-on');
      stopTimer();
      transcript.querySelector('.nia-caret')?.remove();
    });
    at(14150, () => cursor.classList.remove('nia-show'));

    /* 14,3 s : génération */
    at(14300, () => {
      gen.hidden = false;
    });
    at(14450, () => {
      genFill.style.width = '100%';
    });

    /* 16,6 s : la fiche */
    at(16600, () => {
      gen.hidden = true;
      trWrap.hidden = true;
      meter.classList.remove('nia-on');
      field.classList.add('nia-collapsed');
      sheet.hidden = false;
      panel.style.background = '#FFFFFF';
    });

    const stepTimes: Record<number, number> = {
      1: 16700, 2: 17150, 3: 17600, 4: 18050, 5: 18500, 6: 18950,
      7: 19400, 8: 19850, 9: 20300, 10: 20750, 11: 21200,
    };
    Object.keys(stepTimes).forEach((k) => {
      at(stepTimes[Number(k)], () => {
        sheet.querySelectorAll(`.nia-rise[data-step="${k}"]`).forEach((el) => {
          el.classList.add('nia-in');
        });
      });
    });

    /* 20,3 – 26,5 s : défilement de la fiche */
    at(20300, () => {
      const d = sheetScroll.scrollHeight - sheet.clientHeight;
      if (d > 0) {
        sheetScroll.style.transition = 'transform 6.2s cubic-bezier(.3,0,.35,1)';
        sheetScroll.style.transform = `translateY(${-d}px)`;
      }
    });

    /* 26,6 s : outro */
    at(26600, () => outro.classList.add('nia-in'));

    steps.sort((a, b) => a.t - b.t);

    /* ---------- lecture au clic ---------- */
    let timers: ReturnType<typeof setTimeout>[] = [];
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      timers.forEach(clearTimeout);
      timers = [];
      stopTimer();
      cursor.classList.remove('nia-show', 'nia-tap');
      cursor.style.transition = 'none';
      moveTo(760, 470);
      void cursor.offsetWidth;
      cursor.style.transition = '';
      menu.hidden = true;
      items.forEach((el) => el.classList.remove('nia-hot', 'nia-press'));
      field.classList.remove('nia-collapsed');
      select.classList.remove('nia-open', 'nia-filled');
      selectLabel.textContent = 'Aucune matière';
      rec.classList.remove('nia-live');
      recLabel.textContent = 'Démarrer l’enregistrement';
      meter.classList.remove('nia-on');
      wave.classList.remove('nia-on');
      timer.textContent = '00:00';
      setCount(0);
      placeholder.hidden = false;
      trWrap.hidden = true;
      transcript.innerHTML = '';
      cut.classList.remove('nia-in');
      gen.hidden = true;
      genFill.style.transition = 'none';
      genFill.style.width = '0';
      void genFill.offsetWidth;
      genFill.style.transition = '';
      sheet.hidden = true;
      sheetScroll.style.transition = 'none';
      sheetScroll.style.transform = 'none';
      void sheetScroll.offsetWidth;
      sheetScroll.style.transition = '';
      panel.style.background = '';
      sheet.querySelectorAll('.nia-rise').forEach((el) => el.classList.remove('nia-in'));
      outro.classList.remove('nia-in');
    };

    /* image fixe affichée avant la lecture et après */
    const still = () => {
      field.classList.add('nia-collapsed');
      select.classList.add('nia-filled');
      selectLabel.textContent = 'Histoire — Révolution industrielle';
      placeholder.hidden = true;
      sheet.hidden = false;
      panel.style.background = '#FFFFFF';
      sheet.querySelectorAll('.nia-rise').forEach((el) => el.classList.add('nia-in'));
    };

    const play = () => {
      reset();
      setPlaying(true);
      steps.forEach((st) => timers.push(setTimeout(st.fn, st.t)));
      endTimer = setTimeout(() => {
        reset();
        still();
        setPlaying(false);
      }, 32500);
    };

    still();
    playRef.current = play;

    return () => {
      timers.forEach(clearTimeout);
      if (endTimer) clearTimeout(endTimer);
      stopTimer();
      ro.disconnect();
      playRef.current = null;
    };
  }, []);

  return (
    <div className="nia-root" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="nia-outer">
        <div className="nia-stage">
          <div className="nia-app">
            <div className="nia-app-head">
              <h3 className="nia-app-title">Nouvelle note vocale</h3>
              <p className="nia-app-sub">
                Enregistre ton cours, la transcription apparaît en temps réel.
              </p>
            </div>

            <div className="nia-field">
              <div className="nia-field-label">Matière et cours</div>
              <div className="nia-field-row">
                <div className="nia-select">
                  <span className="nia-select-label">Aucune matière</span>
                  <svg
                    className="nia-chev"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="7 9 12 4 17 9" />
                    <polyline points="7 15 12 20 17 15" />
                  </svg>
                </div>
                <button className="nia-ghost" type="button" tabIndex={-1}>
                  Nouvelle matière
                </button>
              </div>
            </div>

            {/* hors de .nia-field : sinon overflow:hidden le rogne entièrement */}
            <div className="nia-menu" hidden>
              <div className="nia-menu-item">
                <span className="nia-dot2" />
                Histoire — Révolution industrielle
              </div>
              <div className="nia-menu-item">
                <span className="nia-dot2" style={{ background: '#8FA37E' }} />
                Économie — Marchés financiers
              </div>
              <div className="nia-menu-item">
                <span className="nia-dot2" style={{ background: '#7E90A3' }} />
                Philosophie — La conscience
              </div>
            </div>

            <div className="nia-rec-row">
              <button className="nia-rec" type="button" tabIndex={-1}>
                <span className="nia-dot" />
                <span className="nia-rec-label">Démarrer l’enregistrement</span>
              </button>
              <div className="nia-meter">
                <span className="nia-timer">00:00</span>
                <span className="nia-count">0 mot</span>
                <span className="nia-wave">
                  {Array.from({ length: 26 }).map((_, i) => (
                    <i
                      key={i}
                      style={{
                        animationDelay: `${(i * 0.055).toFixed(3)}s`,
                        animationDuration: `${(0.62 + (i % 5) * 0.13).toFixed(2)}s`,
                      }}
                    />
                  ))}
                </span>
              </div>
            </div>

            <div className="nia-panel">
              <p className="nia-ph">La transcription s’affichera ici…</p>

              <div className="nia-trwrap" hidden>
                <div className="nia-trinner">
                  <p className="nia-transcript" />
                </div>
              </div>

              <div className="nia-gen" hidden>
                <div className="nia-gen-label">Génération de la fiche…</div>
                <div className="nia-gen-track">
                  <div className="nia-gen-fill" />
                </div>
                <p className="nia-gen-hint">
                  Analyse de 2 h 04 d’enregistrement · 12 480 mots
                </p>
              </div>

              <div className="nia-sheet" hidden>
                <div className="nia-sheet-scroll">
                  <div className="nia-sheet-head">
                    <span className="nia-badge nia-rise" data-step="1">
                      Histoire
                    </span>
                    <h4 className="nia-sheet-title nia-rise" data-step="1">
                      La révolution industrielle
                    </h4>
                    <p className="nia-sheet-meta nia-rise" data-step="1">
                      1760 – 1880 · Angleterre, puis l’Europe continentale
                    </p>
                  </div>

                  <div className="nia-stats nia-rise" data-step="2">
                    <div className="nia-stat">
                      <b>2 h 04</b>
                      <span>DE COURS</span>
                    </div>
                    <div className="nia-stat">
                      <b>12 480</b>
                      <span>MOTS TRANSCRITS</span>
                    </div>
                    <div className="nia-stat">
                      <b>24</b>
                      <span>NOTIONS EXTRAITES</span>
                    </div>
                  </div>

                  <div className="nia-block nia-rise" data-step="3">
                    <div className="nia-block-label">Résumé</div>
                    <p className="nia-summary">
                      Amorcée en Angleterre vers 1760, la révolution industrielle substitue
                      l’énergie mécanique à l’énergie humaine et animale. La machine à vapeur
                      transforme d’abord la production textile et minière, puis les transports
                      avec le chemin de fer. En un siècle, elle refait la carte des villes,
                      invente l’usine et fait naître une classe sociale inédite : le prolétariat
                      ouvrier.
                    </p>
                  </div>

                  <div className="nia-block nia-rise" data-step="4">
                    <div className="nia-block-label">Plan du cours</div>
                    <ul className="nia-plan">
                      <li>
                        <span className="nia-num">I.</span>
                        <span>
                          Les conditions du décollage anglais : charbon, capitaux, empire colonial
                        </span>
                      </li>
                      <li>
                        <span className="nia-num">II.</span>
                        <span>La machine à vapeur et la révolution des transports</span>
                      </li>
                      <li>
                        <span className="nia-num">III.</span>
                        <span>Une société nouvelle : usines, villes, prolétariat</span>
                      </li>
                      <li>
                        <span className="nia-num">IV.</span>
                        <span>La diffusion au continent et les secondes vagues industrielles</span>
                      </li>
                    </ul>
                  </div>

                  <div className="nia-block nia-rise" data-step="5">
                    <div className="nia-block-label">Points clés</div>
                    <ul className="nia-keys">
                      {[
                        'L’Angleterre dispose de charbon abondant, de capitaux issus du commerce colonial et d’un marché intérieur unifié',
                        '1769 — James Watt perfectionne la machine à vapeur avec le condenseur séparé',
                        'Le passage à l’énergie mécanique déplace la production de l’atelier vers l’usine',
                        'L’exode rural vide les campagnes au profit des villes industrielles du Nord',
                        'Le chemin de fer abaisse le coût du transport et unifie les marchés nationaux',
                        'Naissance du prolétariat et des premières luttes sociales organisées',
                      ].map((k) => (
                        <li key={k}>
                          <span className="nia-tick">
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#C4622D"
                              strokeWidth="3.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="nia-block nia-rise" data-step="6">
                    <div className="nia-block-label">Dates clés</div>
                    <div className="nia-dates">
                      {[
                        ['1709', 'Abraham Darby fond le fer au coke à Coalbrookdale'],
                        ['1769', 'Brevet de James Watt sur la machine à vapeur'],
                        ['1811', 'Révolte des Luddites contre les métiers mécaniques'],
                        ['1825', 'Première ligne ferroviaire : Stockton – Darlington'],
                        ['1848', 'Publication du Manifeste du parti communiste'],
                        ['1851', 'Exposition universelle de Londres, vitrine de l’industrie'],
                      ].map(([y, t]) => (
                        <div className="nia-date-row" key={y}>
                          <b>{y}</b>
                          <span>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="nia-block nia-rise" data-step="7">
                    <div className="nia-block-label">Chiffres à connaître</div>
                    <div className="nia-figs">
                      {[
                        ['65 Mt', 'Charbon produit par l’Angleterre en 1850, contre 5 Mt en 1750'],
                        ['×14', 'Population de Manchester entre 1772 et 1851 : 25 000 → 350 000'],
                        ['10 000 km', 'Réseau ferroviaire britannique atteint en 1850'],
                        ['50 %', 'Part anglaise dans la production mondiale de charbon'],
                      ].map(([v, t]) => (
                        <div className="nia-fig" key={v}>
                          <b>{v}</b>
                          <span>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="nia-block nia-rise" data-step="8">
                    <div className="nia-block-label">Définitions</div>
                    <div className="nia-defs">
                      {[
                        ['Exode rural', 'Déplacement massif et durable des populations des campagnes vers les villes.'],
                        ['Machine à vapeur', 'Moteur convertissant la chaleur de l’eau en mouvement mécanique continu.'],
                        ['Prolétariat', 'Classe sociale des ouvriers ne possédant que leur force de travail.'],
                        ['Capitalisme industriel', 'Système où la propriété privée des moyens de production organise la fabrication de masse.'],
                        ['Fonte au coke', 'Procédé remplaçant le charbon de bois par le coke, qui libère la sidérurgie de la ressource forestière.'],
                      ].map(([t, d]) => (
                        <div className="nia-def" key={t}>
                          <b>{t}</b>
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="nia-block nia-rise" data-step="9">
                    <div className="nia-block-label">Personnages clés</div>
                    <div className="nia-people">
                      {[
                        ['James Watt', '1736 – 1819', 'Ingénieur écossais, invente le condenseur séparé qui rend la machine à vapeur rentable.'],
                        ['George Stephenson', '1781 – 1848', 'Construit la Rocket et ouvre l’ère du transport ferroviaire de masse.'],
                        ['Friedrich Engels', '1820 – 1895', 'Décrit les conditions ouvrières de Manchester dans La Situation de la classe laborieuse en Angleterre (1845).'],
                      ].map(([n, d, b]) => (
                        <div className="nia-person" key={n}>
                          <b>{n}</b>
                          <em>{d}</em>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="nia-block nia-rise" data-step="10">
                    <div className="nia-block-label">Chapitres liés</div>
                    <div className="nia-links">
                      {[
                        'Le libéralisme économique au XIXᵉ',
                        'Naissance du mouvement ouvrier',
                        'L’urbanisation européenne',
                        'Colonisation et marchés extérieurs',
                      ].map((c) => (
                        <span className="nia-chip2" key={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="nia-exam nia-rise" data-step="11">
                    <div className="nia-block-label">À retenir pour l’examen</div>
                    <ul>
                      <li>Savoir expliquer pourquoi le décollage a lieu en Angleterre et pas ailleurs</li>
                      <li>Relier l’innovation technique à la transformation sociale, et non l’inverse</li>
                      <li>Situer les six dates charnières dans l’ordre chronologique</li>
                      <li>
                        Distinguer première industrialisation (vapeur, charbon, textile) et seconde
                        (électricité, pétrole, chimie)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="nia-cut">
            <div className="nia-cut-rule" />
            <div className="nia-cut-label">2 heures plus tard</div>
            <p className="nia-cut-sub">L’enregistrement continue</p>
          </div>

          <div className="nia-cursor">
            <span className="nia-ring" />
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="#2B211A"
              stroke="#FBF4EC"
              strokeWidth="1.4"
              strokeLinejoin="round"
            >
              <path d="M5 2.5 L19 12.2 L12.4 13.1 L15.6 19.6 L12.9 20.9 L9.7 14.4 L5 18.4 Z" />
            </svg>
          </div>

          <div className="nia-outro">
            <div className="nia-outro-mark">
              <div className="nia-outro-badge">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FBF4EC"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              </div>
              <span className="nia-outro-name">Note IA</span>
            </div>
            <p className="nia-outro-line">2 h de cours → 1 fiche</p>
            <p className="nia-outro-tag">
              Vos cours, transformés en fiches claires, sans lever un stylo.
            </p>
          </div>
        </div>

        {!playing && (
          <button
            className="nia-play"
            type="button"
            onClick={() => playRef.current?.()}
            aria-label="Lancer la démo de Note IA"
          >
            <span className="nia-play-btn">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            </span>
            <span className="nia-play-label">Voir Note IA en action</span>
          </button>
        )}
      </div>
    </div>
  );
}

const CSS = `
.nia-root{--nia-bg:#FBF4EC;--nia-bg2:#F4E7D8;--nia-surface:#FFFFFF;--nia-ink:#2B211A;--nia-muted:#6B5D4F;--nia-faint:#9C8E7D;--nia-accent:#D97757;--nia-deep:#C4622D;--nia-soft:#F3E4D3;--nia-line:#EDE0CE;--nia-display:'Fraunces',Georgia,serif;--nia-body:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;width:100%}
.nia-root *{box-sizing:border-box}
.nia-root [hidden]{display:none!important}
.nia-outer{width:100%;max-width:1100px;margin:0 auto;aspect-ratio:16/9;position:relative;border-radius:24px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(139,90,52,.35)}
.nia-outer.nia-narrow{aspect-ratio:760/700;border-radius:18px}
.nia-stage{position:absolute;top:0;left:0;width:1280px;height:720px;transform-origin:top left;background:radial-gradient(1000px 620px at 50% -10%,#FFF9F2 0%,rgba(255,249,242,0) 62%),linear-gradient(168deg,#FBF4EC 0%,#F4E7D8 100%);overflow:hidden;font-size:16px;font-family:var(--nia-body);color:var(--nia-ink);text-align:left}
.nia-app{position:absolute;top:46px;left:50%;transform:translateX(-50%);width:672px;height:628px;background:var(--nia-surface);border:1px solid var(--nia-line);border-radius:24px;box-shadow:0 30px 70px -28px rgba(139,90,52,.42);padding:30px 34px 26px;display:flex;flex-direction:column;gap:17px;overflow:hidden}
.nia-app-head{display:flex;flex-direction:column;gap:5px}
.nia-app-title{font-family:var(--nia-display);font-size:29px;font-weight:600;line-height:1.1;margin:0;color:var(--nia-ink)}
.nia-app-sub{margin:0;font-size:14px;color:var(--nia-muted);line-height:1.45}
.nia-field{border:1px solid var(--nia-line);border-radius:16px;padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;background:#FFFDFA;flex:none;max-height:120px;overflow:hidden;transition:opacity .45s ease,max-height .55s ease,padding .55s ease,margin .55s ease,border-color .45s ease}
.nia-field.nia-collapsed{opacity:0;max-height:0;padding-top:0;padding-bottom:0;border-color:transparent;margin-bottom:-17px}
.nia-field-label{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--nia-faint)}
.nia-field-row{display:flex;gap:10px;align-items:center;position:relative}
.nia-select{flex:1;min-width:0;background:var(--nia-soft);border:1px solid transparent;border-radius:11px;padding:10px 13px;font-size:14px;font-weight:500;color:var(--nia-muted);display:flex;align-items:center;justify-content:space-between;gap:10px;transition:border-color .22s ease,color .22s ease,background .22s ease}
.nia-select.nia-open{border-color:var(--nia-accent);background:#FFF}
.nia-select.nia-filled{color:var(--nia-ink);font-weight:600;background:#FFF;border-color:var(--nia-line)}
.nia-chev{flex:none;opacity:.5}
.nia-ghost{flex:none;background:var(--nia-surface);border:1px solid var(--nia-line);border-radius:11px;padding:10px 15px;font-size:13.5px;font-weight:600;color:var(--nia-ink);font-family:var(--nia-body);cursor:default}
.nia-menu{position:absolute;background:var(--nia-surface);border:1px solid var(--nia-line);border-radius:14px;box-shadow:0 18px 44px -12px rgba(139,90,52,.38);padding:6px;z-index:12;transform-origin:top left;animation:niaMenuIn .2s cubic-bezier(.2,.7,.3,1) both}
@keyframes niaMenuIn{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:none}}
.nia-menu-item{padding:10px 12px;border-radius:9px;font-size:14px;color:var(--nia-ink);display:flex;align-items:center;gap:10px;transition:background .16s ease,color .16s ease}
.nia-menu-item+.nia-menu-item{margin-top:2px}
.nia-menu-item.nia-hot{background:var(--nia-soft);font-weight:600}
.nia-menu-item.nia-press{animation:niaItemPress .24s ease both}
@keyframes niaItemPress{0%{background:#E6D2B7;transform:scale(.982)}100%{background:var(--nia-soft);transform:none}}
.nia-dot2{width:7px;height:7px;border-radius:50%;background:var(--nia-accent);flex:none}
.nia-rec-row{display:flex;align-items:center;gap:12px;flex:none;flex-wrap:wrap}
.nia-rec{background:var(--nia-surface);border:1.5px solid var(--nia-line);border-radius:999px;padding:12px 22px;font-size:14.5px;font-weight:600;color:var(--nia-ink);font-family:var(--nia-body);display:inline-flex;align-items:center;gap:10px;cursor:default;transition:border-color .25s ease,background .25s ease,color .25s ease}
.nia-dot{width:10px;height:10px;border-radius:50%;background:var(--nia-accent);flex:none;transition:background .25s ease}
.nia-rec.nia-live{border-color:#D2503C;background:#FDF1ED;color:#A33A28}
.nia-rec.nia-live .nia-dot{background:#D2503C;animation:niaPulse 1.5s ease-in-out infinite}
@keyframes niaPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)}}
.nia-meter{display:flex;align-items:center;gap:11px;opacity:0;transition:opacity .3s ease}
.nia-meter.nia-on{opacity:1}
.nia-timer{font-size:14.5px;font-weight:700;color:var(--nia-ink);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.nia-count{font-size:12px;font-weight:600;color:#8A5A34;background:var(--nia-soft);border-radius:999px;padding:4px 10px;font-variant-numeric:tabular-nums;white-space:nowrap}
.nia-wave{display:flex;align-items:center;gap:3px;height:24px}
.nia-wave i{display:block;width:3px;border-radius:2px;background:var(--nia-accent);height:6px;opacity:.75}
.nia-wave.nia-on i{animation-name:niaBar;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
@keyframes niaBar{from{height:5px;opacity:.45}to{height:20px;opacity:.9}}
.nia-panel{flex:1;min-height:0;border:1px solid var(--nia-line);border-radius:16px;background:#FFFDFA;padding:18px 20px;overflow:hidden;position:relative;display:flex;flex-direction:column;transition:background .5s ease}
.nia-ph{margin:0;font-size:15px;color:var(--nia-faint)}
.nia-trwrap{flex:1;min-height:0;overflow:hidden;position:relative;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 26px,#000 calc(100% - 4px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 26px,#000 calc(100% - 4px),transparent 100%)}
.nia-trinner{position:absolute;left:0;right:0;bottom:0}
.nia-transcript{margin:0;font-size:16px;line-height:1.72;color:var(--nia-ink)}
.nia-old{color:var(--nia-faint)}
.nia-caret{display:inline-block;width:2px;height:1em;background:var(--nia-accent);vertical-align:-2px;margin-left:2px;animation:niaBlink .95s steps(1) infinite}
@keyframes niaBlink{0%,49%{opacity:1}50%,100%{opacity:0}}
.nia-gen{position:absolute;inset:0;background:rgba(255,253,250,.95);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px}
.nia-gen-label{font-family:var(--nia-display);font-size:20px;font-weight:600;color:var(--nia-ink)}
.nia-gen-track{width:250px;height:4px;border-radius:999px;background:var(--nia-soft);overflow:hidden}
.nia-gen-fill{height:100%;width:0;border-radius:999px;background:var(--nia-accent);transition:width 2.1s cubic-bezier(.35,.1,.25,1)}
.nia-gen-hint{font-size:13px;color:var(--nia-faint);margin:0;font-variant-numeric:tabular-nums}
.nia-sheet{flex:1;min-height:0;overflow:hidden;position:relative;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent 100%);mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent 100%)}
.nia-sheet-scroll{display:flex;flex-direction:column;gap:16px;will-change:transform}
.nia-sheet-head{display:flex;flex-direction:column;gap:8px}
.nia-badge{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;background:var(--nia-soft);border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8A5A34}
.nia-sheet-title{font-family:var(--nia-display);font-size:28px;font-weight:600;line-height:1.12;margin:0;color:var(--nia-ink)}
.nia-sheet-meta{margin:0;font-size:13px;color:var(--nia-faint);font-variant-numeric:tabular-nums}
.nia-stats{display:flex;gap:10px;flex-wrap:wrap}
.nia-stat{background:var(--nia-soft);border-radius:11px;padding:9px 13px;display:flex;flex-direction:column;gap:1px}
.nia-stat b{font-family:var(--nia-display);font-size:17px;font-weight:600;color:var(--nia-ink);font-variant-numeric:tabular-nums}
.nia-stat span{font-size:11px;color:#8A5A34;font-weight:600;letter-spacing:.03em}
.nia-block{display:flex;flex-direction:column;gap:8px}
.nia-block-label{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--nia-deep)}
.nia-summary{margin:0;font-size:14.5px;line-height:1.62;color:var(--nia-muted)}
.nia-plan{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.nia-plan li{display:flex;gap:11px;font-size:14.5px;line-height:1.45;color:var(--nia-ink)}
.nia-num{flex:none;font-family:var(--nia-display);font-size:13px;font-weight:700;color:var(--nia-deep);min-width:22px}
.nia-keys{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.nia-keys li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.5;color:var(--nia-ink)}
.nia-tick{flex:none;width:18px;height:18px;border-radius:6px;background:var(--nia-soft);display:flex;align-items:center;justify-content:center;margin-top:1px}
.nia-dates{display:flex;flex-direction:column}
.nia-date-row{display:flex;gap:14px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--nia-line)}
.nia-date-row:last-child{border-bottom:none}
.nia-date-row b{flex:none;font-family:var(--nia-display);font-size:15px;font-weight:700;color:var(--nia-deep);font-variant-numeric:tabular-nums;min-width:44px}
.nia-date-row span{font-size:14px;line-height:1.45;color:var(--nia-ink)}
.nia-figs{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.nia-fig{border:1px solid var(--nia-line);border-radius:12px;padding:10px 13px;display:flex;flex-direction:column;gap:3px;background:#FFFDFA}
.nia-fig b{font-family:var(--nia-display);font-size:19px;font-weight:700;color:var(--nia-deep);font-variant-numeric:tabular-nums;line-height:1}
.nia-fig span{font-size:12.5px;line-height:1.45;color:var(--nia-muted)}
.nia-defs{display:flex;flex-direction:column;gap:9px}
.nia-def{border-left:2.5px solid var(--nia-accent);padding:2px 0 2px 12px;display:flex;flex-direction:column;gap:2px}
.nia-def b{font-size:14px;font-weight:600;color:var(--nia-ink)}
.nia-def span{font-size:13px;line-height:1.5;color:var(--nia-muted)}
.nia-people{display:flex;flex-direction:column;gap:11px}
.nia-person{display:flex;flex-direction:column;gap:2px}
.nia-person b{font-size:14.5px;font-weight:600;color:var(--nia-ink)}
.nia-person em{font-style:normal;font-size:11.5px;font-weight:600;letter-spacing:.04em;color:var(--nia-faint);font-variant-numeric:tabular-nums}
.nia-person span{font-size:13px;line-height:1.5;color:var(--nia-muted)}
.nia-links{display:flex;flex-wrap:wrap;gap:7px}
.nia-chip2{border:1px solid var(--nia-line);border-radius:999px;padding:6px 13px;font-size:12.5px;font-weight:500;color:var(--nia-muted);background:#FFFDFA}
.nia-exam{background:var(--nia-soft);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.nia-exam ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.nia-exam li{font-size:13.5px;line-height:1.5;color:var(--nia-ink);display:flex;gap:9px}
.nia-exam li::before{content:'\\2192';color:var(--nia-deep);font-weight:700;flex:none}
.nia-rise{opacity:0;transform:translateY(10px)}
.nia-rise.nia-in{opacity:1;transform:none;transition:opacity .5s ease,transform .5s cubic-bezier(.2,.7,.3,1)}
.nia-cut{position:absolute;inset:0;z-index:25;background:radial-gradient(760px 460px at 50% 46%,#FFFAF4 0%,rgba(255,250,244,0) 70%),linear-gradient(168deg,#F7EDE2 0%,#EDDCC6 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;opacity:0;transition:opacity .22s ease;pointer-events:none}
.nia-cut.nia-in{opacity:1}
.nia-cut-rule{width:0;height:1.5px;border-radius:2px;background:var(--nia-accent);opacity:.75;transition:width .5s cubic-bezier(.2,.7,.3,1)}
.nia-cut.nia-in .nia-cut-rule{width:120px}
.nia-cut-label{font-family:var(--nia-display);font-size:34px;font-weight:600;color:var(--nia-ink);opacity:0;transform:translateY(6px);transition:opacity .4s ease .1s,transform .4s ease .1s}
.nia-cut.nia-in .nia-cut-label{opacity:1;transform:none}
.nia-cut-sub{margin:0;font-size:13px;color:var(--nia-deep);letter-spacing:.1em;text-transform:uppercase;font-weight:700;opacity:0;transition:opacity .4s ease .2s}
.nia-cut.nia-in .nia-cut-sub{opacity:1}
.nia-cursor{position:absolute;top:0;left:0;width:26px;height:26px;z-index:20;pointer-events:none;opacity:0;transform:translate(660px,470px);transition:transform .62s cubic-bezier(.45,.05,.25,1),opacity .3s ease;filter:drop-shadow(0 3px 6px rgba(43,33,26,.28))}
.nia-cursor.nia-show{opacity:1}
.nia-ring{position:absolute;top:-10px;left:-8px;width:26px;height:26px;border-radius:50%;border:2px solid var(--nia-accent);opacity:0}
.nia-cursor.nia-tap .nia-ring{animation:niaTap .45s ease-out}
@keyframes niaTap{0%{opacity:.85;transform:scale(.35)}100%{opacity:0;transform:scale(1.15)}}
.nia-outro{position:absolute;inset:0;z-index:30;background:linear-gradient(168deg,#FBF4EC 0%,#F4E7D8 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;opacity:0;pointer-events:none;transition:opacity .7s ease}
.nia-outro.nia-in{opacity:1}
.nia-outro-mark{display:flex;align-items:center;gap:14px}
.nia-outro-badge{width:56px;height:56px;border-radius:16px;background:var(--nia-accent);display:flex;align-items:center;justify-content:center}
.nia-outro-name{font-family:var(--nia-display);font-size:40px;font-weight:600;color:var(--nia-ink)}
.nia-outro-line{margin:0;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--nia-deep)}
.nia-outro-tag{margin:0;font-size:19px;color:var(--nia-muted);text-align:center;max-width:540px;line-height:1.45}
.nia-play{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border:0;padding:0;margin:0;cursor:pointer;background:rgba(251,244,236,.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-family:var(--nia-body);color:var(--nia-ink)}
.nia-play-btn{width:84px;height:84px;border-radius:50%;background:var(--nia-ink);color:var(--nia-bg);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px rgba(43,33,26,.3);transition:transform .2s ease}
.nia-play-btn svg{margin-left:4px}
.nia-play:hover .nia-play-btn,.nia-play:focus-visible .nia-play-btn{transform:scale(1.06)}
.nia-play:focus-visible{outline:3px solid var(--nia-accent);outline-offset:-3px}
.nia-play-label{font-family:var(--nia-display);font-size:20px;font-weight:600}
.nia-narrow .nia-play-btn{width:64px;height:64px}
.nia-narrow .nia-play-btn svg{width:20px;height:20px}
.nia-narrow .nia-play-label{font-size:17px}
@media (prefers-reduced-motion:reduce){
.nia-wave.nia-on i{animation:none;height:12px}
.nia-rec.nia-live .nia-dot{animation:none}
.nia-caret{animation:none}
.nia-rise{opacity:1;transform:none}
}
`;
