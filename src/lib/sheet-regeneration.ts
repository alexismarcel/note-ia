import type { createAdminClient } from "@/lib/supabase/admin";

// Accounts allowed to generate a recording's sheet again, past the one
// generation per note (20261007100000_one_sheet_per_note.sql) — to try a new
// prompt on a real recording. Each generation is still a paid call.
const SHEET_REGENERATION_EMAILS = ["alexismarcel89@gmail.com"];

// Case-insensitive, like has_unlimited_access(): the address typed at sign-up
// is not always the casing written here.
export function canRegenerateSheets(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  return !!normalized && SHEET_REGENERATION_EMAILS.includes(normalized);
}

// Same answers as acquire_sheet_generation() minus "done": a completed
// generation is taken over like an expired one. A generation still in
// progress (less than 10 minutes old) keeps the note, so two clicks still
// cannot pay for two calls at once. The previous sheet stays in ai_summary
// until the new one replaces it, so a failed attempt loses nothing.
export async function acquireRegeneration(
  admin: ReturnType<typeof createAdminClient>,
  noteId: string,
  userId: string
): Promise<{ state: "acquired" | "in_progress" } | { error: unknown }> {
  const expiredBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: taken, error: updateError } = await admin
    .from("note_sheet_generations")
    .update({
      generated_at: new Date().toISOString(),
      user_id: userId,
      completed_at: null,
      insufficient_message: null,
    })
    .eq("note_id", noteId)
    .or(`completed_at.not.is.null,generated_at.lt."${expiredBefore}"`)
    .select("note_id");
  if (updateError) return { error: updateError };
  if (taken.length > 0) return { state: "acquired" };

  // No row to take over: either none exists yet, or one is in progress.
  const { error: insertError } = await admin
    .from("note_sheet_generations")
    .insert({ note_id: noteId, user_id: userId });
  if (!insertError) return { state: "acquired" };
  // Unique violation: another request holds the note.
  if (insertError.code === "23505") return { state: "in_progress" };
  return { error: insertError };
}
