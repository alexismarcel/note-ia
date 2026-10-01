import type { createAdminClient } from "@/lib/supabase/admin";
import { isTestAccount } from "@/lib/test-accounts";

// The test accounts may generate a recording's sheet again, past the one
// generation per note (20261007100000_one_sheet_per_note.sql) — to try a new
// prompt on a real recording. Each generation is still a paid call.
export const canRegenerateSheets = isTestAccount;

// Same answers as acquire_sheet_generation() minus "done": a completed
// generation is taken over like an expired one. A generation still in
// progress (less than 10 minutes old) keeps the note, so two clicks still
// cannot pay for two calls at once. The previous sheet stays in ai_summary
// until the new one replaces it, so a failed attempt loses nothing.
//
// Delete then insert rather than one update: PostgREST rejects a PATCH whose
// filter reads a column its body also sets (42703 "column ... does not
// exist" on completed_at), which made every regeneration fail to start. Two
// requests racing here both delete, and the primary key lets only one insert.
export async function acquireRegeneration(
  admin: ReturnType<typeof createAdminClient>,
  noteId: string,
  userId: string
): Promise<{ state: "acquired" | "in_progress" } | { error: unknown }> {
  const expiredBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { error: deleteError } = await admin
    .from("note_sheet_generations")
    .delete()
    .eq("note_id", noteId)
    .or(`completed_at.not.is.null,generated_at.lt."${expiredBefore}"`);
  if (deleteError) return { error: deleteError };

  // Whatever is left is a generation in progress.
  const { error: insertError } = await admin
    .from("note_sheet_generations")
    .insert({ note_id: noteId, user_id: userId });
  if (!insertError) return { state: "acquired" };
  // Unique violation: another request holds the note.
  if (insertError.code === "23505") return { state: "in_progress" };
  return { error: insertError };
}
