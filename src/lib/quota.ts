// The free allowance, mirrored from the database.
//
// The numbers live in free_sheet_allowance() / free_recording_seconds() and
// are enforced there; these copies exist only so a page can say "3 sur 10"
// without a second round trip. Changing one means changing both.
export const FREE_SHEETS = 10;
export const FREE_RECORDING_SECONDS = 3 * 3600;

export type AllowanceReason =
  | "free"
  | "subscribed"
  | "sheet_limit"
  | "time_limit"
  | "no_profile"
  | "unauthenticated";

export type Allowance = {
  allowed: boolean;
  reason: AllowanceReason;
  recorded_seconds: number;
  sheets_used: number;
};

export type SheetClaim = {
  allowed: boolean;
  reason: AllowanceReason;
  sheets_used: number;
};

// What the user reads when a ceiling stops them. Both name the other half of
// the rule, so nobody has to guess why one thing still works and another does
// not.
export const LOCK_COPY: Record<string, { title: string; body: string }> = {
  sheet_limit: {
    title: `Tes ${FREE_SHEETS} fiches gratuites sont utilisées`,
    body: "L'abonnement débloque les fiches et l'enregistrement, sans limite. Tes notes et tes fiches déjà créées restent accessibles.",
  },
  time_limit: {
    title: "Tu as atteint 3 h d'enregistrement gratuit",
    body: `Tu peux encore générer des fiches à partir de ce que tu as déjà enregistré, jusqu'à ${FREE_SHEETS} au total. Pour enregistrer de nouveau, il faut l'abonnement.`,
  },
  no_profile: {
    title: "Profil introuvable",
    body: "Déconnecte-toi et reconnecte-toi. Si ça recommence, dis-le moi.",
  },
  unauthenticated: {
    title: "Session expirée",
    body: "Reconnecte-toi pour continuer.",
  },
};

// "2 h 15", "45 min" — a duration a student reads at a glance, not 8100 s.
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

const FALLBACK: Allowance = {
  allowed: false,
  reason: "no_profile",
  recorded_seconds: 0,
  sheets_used: 0,
};

type RpcCapable = {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

// recording_allowance() returns a one-row table, which PostgREST hands back as
// an array. A failure is treated as "not allowed": the gate opening because a
// query broke would be the wrong way to fail.
export async function readRecordingAllowance(
  supabase: RpcCapable
): Promise<Allowance> {
  const { data, error } = await supabase.rpc("recording_allowance");
  if (error) {
    console.error("[quota] recording_allowance failed:", error);
    return FALLBACK;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Allowance | undefined) ?? FALLBACK;
}
