import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Mints a short-lived Deepgram access token so the browser never sees the
// permanent DEEPGRAM_API_KEY. The client uses this token once to
// authenticate the streaming WebSocket (see /dashboard/record).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 30 }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `deepgram_grant_failed: ${response.status} ${text}` },
      { status: 502 }
    );
  }

  const data = await response.json();
  if (typeof data.access_token !== "string" || !data.access_token) {
    // Deepgram returned 200 but not the shape we expect — surface the raw
    // body instead of letting the client silently fail at the WebSocket
    // handshake with a token of "undefined".
    return NextResponse.json(
      { error: `deepgram_grant_unexpected_response: ${JSON.stringify(data)}` },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
