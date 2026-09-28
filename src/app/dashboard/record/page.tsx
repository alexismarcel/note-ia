import { createClient } from "@/lib/supabase/server";
import { readRecordingAllowance } from "@/lib/quota";
import QuotaLock from "../quota-lock";
import RecordClient from "./record-client";

// ?matiere=<id> / ?cours=<id> file the séance before it is captured, and they
// are read here rather than with useSearchParams in the client: that hook
// needs a Suspense boundary, and the boundary made the whole recorder render
// client-side — the page was served as an empty 8 KB shell that showed nothing
// until 800 KB of JavaScript had arrived.
export default async function RecordPage({
  searchParams,
}: PageProps<"/dashboard/record">) {
  const { matiere, cours } = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : null;

  // Checked here so a blocked user is not offered a microphone permission
  // prompt and a socket before being told no. /api/*/token refuses as well:
  // this is the courtesy, that is the control.
  const supabase = await createClient();
  const allowance = await readRecordingAllowance(supabase);

  if (!allowance.allowed) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 sm:px-8">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">
            Nouvelle note vocale
          </h1>
        </div>
        <QuotaLock reason={allowance.reason} />
      </main>
    );
  }

  return (
    <RecordClient prefill={{ subjectId: one(matiere), courseId: one(cours) }} />
  );
}
