import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Bloc, Fiche } from "@/components/FicheView";
import type { StoredSheet } from "@/lib/fiche";

// The sheet as a real PDF file, built on the server so that "Télécharger en
// PDF" downloads a file on every device instead of opening a print dialog.
// Laid out after FicheView: same sections, marks and colours, in the app's
// fonts (bundled, see next.config.ts for why they ship with the route).

const FONTS = path.join(process.cwd(), "src/lib/pdf/fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONTS, "inter-latin-400-normal.woff") },
    { src: path.join(FONTS, "inter-latin-400-italic.woff"), fontStyle: "italic" },
    { src: path.join(FONTS, "inter-latin-600-normal.woff"), fontWeight: 600 },
    { src: path.join(FONTS, "inter-latin-700-normal.woff"), fontWeight: 700 },
  ],
});
Font.register({
  family: "Fraunces",
  src: path.join(FONTS, "fraunces-latin-600-normal.woff"),
  fontWeight: 600,
});
// The default hyphenation is English and splits French words wrongly.
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: "#2B211A",
  muted: "#6B5D4F",
  faint: "#9C8E7D",
  accent: "#D97757",
  deep: "#C4622D",
  line: "#EDE0CE",
  soft: "#FCF4EA",
  alerte: "#C0412C",
  alerteBg: "#FDF1ED",
  pratiqueBg: "#FAF6F0",
};

const ROMAIN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: "Inter",
    fontSize: 10.5,
    lineHeight: 1.55,
    color: C.ink,
  },
  matiere: {
    alignSelf: "flex-start",
    fontSize: 8.5,
    fontWeight: 600,
    color: C.deep,
    backgroundColor: C.soft,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  titre: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 22, lineHeight: 1.2 },
  rule: { width: 36, height: 2.5, backgroundColor: C.accent, marginTop: 10, marginBottom: 8 },
  meta: { fontSize: 9, color: C.faint, marginBottom: 18 },
  label: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.deep,
    marginBottom: 8,
  },
  planLigne: { flexDirection: "row", marginBottom: 4 },
  planNum: { width: 26, fontFamily: "Fraunces", fontWeight: 600, color: C.deep },
  h2: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 14.5, marginTop: 18, marginBottom: 8 },
  h3: { fontWeight: 600, fontSize: 11.5, marginTop: 12, marginBottom: 6 },
  bloc: { flexDirection: "row", marginBottom: 7 },
  puce: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 6, marginRight: 9 },
  blocCorps: { flex: 1 },
  cle: { borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 9, marginBottom: 7 },
  pratique: { backgroundColor: C.pratiqueBg, borderRadius: 6, padding: 8, marginBottom: 7, color: C.muted },
  prof: {
    backgroundColor: C.alerteBg,
    borderLeftWidth: 2.5,
    borderLeftColor: C.alerte,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  badge: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.alerte, marginBottom: 2 },
  citation: { fontSize: 9.5, fontStyle: "italic", color: C.alerte, marginBottom: 3 },
  terme: { fontWeight: 700 },
  annee: { fontWeight: 700 },
  doute: { color: C.faint },
  encadre: {
    backgroundColor: C.soft,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
  },
  pointille: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.line,
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  item: { flexDirection: "row", marginBottom: 5 },
  pastille: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent, marginTop: 6, marginRight: 9 },
  reserves: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 18 },
  reserve: { fontSize: 9, color: C.faint, marginBottom: 4 },
  texteBrut: { fontSize: 10.5, lineHeight: 1.6 },
  pied: { position: "absolute", bottom: 26, left: 52, right: 52, fontSize: 8, color: C.faint, textAlign: "right" },
});

const dateCourte = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

// Same highlighting as FicheView's rich(): years in bold, "(?)" set apart.
function Riche({ texte }: { texte: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\b(1[0-9]{3}|20[0-9]{2})\b|\(\?\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) {
    if (m.index > last) parts.push(texte.slice(last, m.index));
    parts.push(
      <Text key={m.index} style={m[0] === "(?)" ? s.doute : s.annee}>
        {m[0]}
      </Text>
    );
    last = m.index + m[0].length;
  }
  if (last < texte.length) parts.push(texte.slice(last));
  return <>{parts}</>;
}

function BlocPdf({ b }: { b: Bloc }) {
  const corps = (
    <Text>
      {b.terme && <Text style={s.terme}>{b.terme} — </Text>}
      <Riche texte={b.texte} />
    </Text>
  );
  if (b.marque === "prof") {
    return (
      <View style={s.prof} wrap={false}>
        <Text style={s.badge}>Signalé en cours</Text>
        {b.signal && <Text style={s.citation}>« {b.signal} »</Text>}
        {corps}
      </View>
    );
  }
  if (b.marque === "cle") return <View style={s.cle} wrap={false}>{corps}</View>;
  if (b.marque === "pratique") return <View style={s.pratique} wrap={false}>{corps}</View>;
  return (
    <View style={s.bloc} wrap={false}>
      <View style={s.puce} />
      <View style={s.blocCorps}>{corps}</View>
    </View>
  );
}

function Liste({ items }: { items: string[] }) {
  return (
    <>
      {items.map((p, i) => (
        <View key={i} style={s.item} wrap={false}>
          <View style={s.pastille} />
          <Text style={s.blocCorps}>
            <Riche texte={p} />
          </Text>
        </View>
      ))}
    </>
  );
}

type Meta = { matiere?: string; creeLe?: string };

function FichePdf({ fiche, matiere, creeLe }: { fiche: Exclude<Fiche, { suffisant: false }> } & Meta) {
  return (
    <>
      {matiere && <Text style={s.matiere}>{matiere}</Text>}
      <Text style={s.titre}>{fiche.titre}</Text>
      <View style={s.rule} />
      {creeLe ? <Text style={s.meta}>Généré le {dateCourte(creeLe)}</Text> : <View style={{ height: 14 }} />}

      {fiche.sections.length > 0 && (
        <View>
          <Text style={s.label}>Plan du cours</Text>
          {fiche.sections.map((sec, i) => (
            <View key={i} style={s.planLigne}>
              <Text style={s.planNum}>{ROMAIN[i] ?? i + 1}.</Text>
              <Text style={s.blocCorps}>{sec.titre}</Text>
            </View>
          ))}
        </View>
      )}

      {fiche.sections.map((sec, i) => (
        <View key={i}>
          {/* minPresenceAhead keeps a heading from ending a page alone */}
          <Text style={(sec.niveau ?? 2) === 2 ? s.h2 : s.h3} minPresenceAhead={40}>
            {sec.titre}
          </Text>
          {sec.blocs.map((b, j) => (
            <BlocPdf key={j} b={b} />
          ))}
        </View>
      ))}

      {!!fiche.prioritaire?.length && (
        <View style={s.encadre} wrap={false}>
          <Text style={s.label}>À retenir en priorité</Text>
          <Liste items={fiche.prioritaire} />
        </View>
      )}

      {!!fiche.pratique?.length && (
        <View style={s.pointille} wrap={false}>
          <Text style={s.label}>Informations pratiques</Text>
          <Liste items={fiche.pratique} />
        </View>
      )}

      {!!fiche.reserves?.length && (
        <View style={s.reserves}>
          <Text style={[s.label, { color: C.faint }]}>Ce qui n’a pas été dit clairement</Text>
          {fiche.reserves.map((r, i) => (
            <Text key={i} style={s.reserve}>
              {r}
            </Text>
          ))}
        </View>
      )}
    </>
  );
}

export async function renderSheetPdf(
  sheet: StoredSheet,
  meta: Meta & { titre: string }
): Promise<Buffer> {
  return renderToBuffer(
    <Document title={meta.titre} author="Note IA" language="fr">
      <Page size="A4" style={s.page}>
        {typeof sheet === "string" ? (
          // Sheets from before the JSON migration: markdown, shown as text
          // as the app shows them.
          <>
            <Text style={s.titre}>{meta.titre}</Text>
            <View style={s.rule} />
            <Text style={s.texteBrut}>{sheet}</Text>
          </>
        ) : sheet.suffisant === false ? (
          <Text>{sheet.message}</Text>
        ) : (
          <FichePdf fiche={sheet} matiere={meta.matiere} creeLe={meta.creeLe} />
        )}
        {/* Static: a render-prop footer (page numbers) comes out empty
            under the Next.js server build. */}
        <Text style={s.pied} fixed>
          {meta.titre} · Note IA
        </Text>
      </Page>
    </Document>
  );
}
