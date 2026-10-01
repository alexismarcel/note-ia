import { createClient } from "@/lib/supabase/server";
import { isInsufficient, toStoredSheet } from "@/lib/fiche";
import { titleFromSheet } from "@/lib/notes/title";
import { renderSheetPdf } from "@/lib/pdf/fiche-pdf";

export const dynamic = "force-dynamic";

// "Télécharger en PDF": the note's saved sheet as a PDF file, sent as an
// attachment so that every browser — phones included — saves it rather than
// opening a print dialog. Read through the caller's own client, so RLS only
// ever hands back their own notes.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/notes/[id]/pdf">
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Connecte-toi pour télécharger cette fiche.", { status: 401 });
  }

  const { data: note, error } = await supabase
    .from("notes")
    .select("title, ai_summary, created_at, subject_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[pdf] note lookup failed:", error);
    return new Response("Impossible de charger la fiche.", { status: 500 });
  }
  const sheet = toStoredSheet(note?.ai_summary);
  if (!note || !sheet || isInsufficient(sheet)) {
    return new Response("Cette note n'a pas de fiche à télécharger.", { status: 404 });
  }

  const { data: subject } = note.subject_id
    ? await supabase.from("subjects").select("name").eq("id", note.subject_id).maybeSingle()
    : { data: null };

  const titre = titleFromSheet(sheet) ?? note.title ?? "Fiche";
  let pdf: Buffer;
  try {
    pdf = await renderSheetPdf(sheet, {
      titre,
      matiere: subject?.name ?? undefined,
      creeLe: note.created_at,
    });
  } catch (err) {
    console.error(`[pdf] note=${id} render failed:`, err);
    return new Response("La fiche n'a pas pu être convertie en PDF.", { status: 500 });
  }

  // An ASCII fallback for old clients, and the real title for the others.
  const nom = `Fiche - ${titre}`.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 120);
  const ascii = nom.normalize("NFD").replace(/[^\x20-\x7e]/g, "").trim() || "Fiche";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(nom)}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
