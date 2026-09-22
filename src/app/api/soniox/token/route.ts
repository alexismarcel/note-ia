import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Long enough for a full lecture: the session, once open, may run this long.
// Soniox caps this at 18000s.
const MAX_SESSION_SECONDS = 14400;
// Only has to cover the gap between minting and opening the socket.
const EXPIRES_IN_SECONDS = 60;

// Mints a short-lived Soniox key so the browser never sees the permanent
// SONIOX_API_KEY. Mirrors /api/deepgram/token; which one the client calls is
// decided by NEXT_PUBLIC_STT_PROVIDER.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SONIOX_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(
    "https://api.soniox.com/v1/auth/temporary-api-key",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: EXPIRES_IN_SECONDS,
        max_session_duration_seconds: MAX_SESSION_SECONDS,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `soniox_temp_key_failed: ${response.status} ${text}` },
      { status: 502 }
    );
  }

  const data = await response.json();
  if (typeof data.api_key !== "string" || !data.api_key) {
    return NextResponse.json(
      { error: `soniox_temp_key_unexpected_response: ${JSON.stringify(data)}` },
      { status: 502 }
    );
  }

  // Proves server-side that Soniox was reached and accepted the permanent
  // key — visible in `npm run dev` locally and in the Vercel function logs.
  console.log(
    `[stt] minted Soniox temporary key, expires_at=${data.expires_at ?? "?"}`
  );

  return NextResponse.json({ api_key: data.api_key });
}
