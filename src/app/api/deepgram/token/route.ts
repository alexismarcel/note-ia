import { NextResponse } from "next/server";
import https from "node:https";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Must stay identical to the query params /dashboard/record uses to open
// the real streaming socket, so the probe below fails/succeeds the same
// way the browser's connection would.
const LISTEN_PARAMS = new URLSearchParams({
  model: "nova-2",
  language: "fr",
  smart_format: "true",
  interim_results: "true",
  encoding: "linear16",
  sample_rate: "16000",
  channels: "1",
  endpointing: "300",
});

// The browser's WebSocket API never exposes the HTTP status/body of a
// failed handshake (it only ever sees close code 1006), which makes
// misconfiguration (bad token scope, disabled model, wrong params, plan
// limits) undiagnosable from the client. Node's http client isn't bound by
// that restriction, so probe the exact same handshake here and surface
// whatever Deepgram actually said.
function probeDeepgramSocket(
  accessToken: string
): Promise<{ ok: true } | { ok: false; detail: string }> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.deepgram.com",
      path: `/v1/listen?${LISTEN_PARAMS}`,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
        "Sec-WebSocket-Protocol": `bearer, ${accessToken}`,
      },
    });

    req.on("upgrade", (res) => {
      resolve({ ok: true });
      res.socket.destroy();
    });

    req.on("response", (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          ok: false,
          detail: `HTTP ${res.statusCode} ${res.statusMessage}${body ? `: ${body}` : ""}`,
        });
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, detail: err.message });
    });

    req.end();
  });
}

async function grantAccessToken(
  apiKey: string
): Promise<{ ok: true; data: { access_token: string } } | { ok: false; error: string }> {
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
    return { ok: false, error: `deepgram_grant_failed: ${response.status} ${text}` };
  }

  const data = await response.json();
  if (typeof data.access_token !== "string" || !data.access_token) {
    // Deepgram returned 200 but not the shape we expect — surface the raw
    // body instead of letting the client silently fail at the WebSocket
    // handshake with a token of "undefined".
    return {
      ok: false,
      error: `deepgram_grant_unexpected_response: ${JSON.stringify(data)}`,
    };
  }

  return { ok: true, data: data as { access_token: string } };
}

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

  // Two independent grants: Deepgram's short-lived tokens are meant for a
  // single connection, so probing with the same token the client will use
  // would consume it and make the client's own connection fail right after
  // — a self-inflicted 1006 that looks identical to a real config problem.
  const [clientGrant, probeGrant] = await Promise.all([
    grantAccessToken(apiKey),
    grantAccessToken(apiKey),
  ]);

  if (!clientGrant.ok) {
    return NextResponse.json({ error: clientGrant.error }, { status: 502 });
  }

  if (probeGrant.ok) {
    const probe = await probeDeepgramSocket(probeGrant.data.access_token);
    if (!probe.ok) {
      // The grant succeeded but the actual streaming handshake wouldn't —
      // this is the real cause the browser's 1006 close code can't show.
      return NextResponse.json(
        { error: `deepgram_socket_probe_failed: ${probe.detail}` },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(clientGrant.data);
}
