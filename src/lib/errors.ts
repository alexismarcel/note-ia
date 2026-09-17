// Supabase rejects with PostgrestError — a plain object, not an Error — so an
// `instanceof Error` check alone silently discards the only diagnostic there
// is and leaves the user staring at "Erreur inconnue".
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const { message, code, details, hint } = err as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    return [message, code && `(${code})`, details, hint]
      .filter(Boolean)
      .join(" ");
  }
  return "Erreur inconnue";
}
