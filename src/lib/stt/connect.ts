// Both speech-to-text providers behind one interface, so switching is a
// config change rather than an edit. Deepgram is the proven path; Soniox was
// written from its published protocol and its official web package, but could
// not be exercised before shipping — hence the runtime switch below rather
// than a replacement.

export type SttProvider = "deepgram" | "soniox";

export type SttCallbacks = {
  // Text to append verbatim to the confirmed transcript; each provider
  // supplies its own leading separator.
  onFinalDelta: (text: string) => void;
  onInterim: (text: string) => void;
  // The socket dropped after having been open, and close() was not what did
  // it. Without this the recording dies in silence and the UI keeps claiming
  // to listen.
  onDropped?: (event: CloseEvent) => void;
};

export type SttConnection = {
  sendFrame: (pcm: ArrayBuffer) => void;
  finalize: () => void;
  close: () => void;
};

const KEEPALIVE_INTERVAL_MS = 5000;

export const SAMPLE_RATE = 16000;

export function resolveProvider(): SttProvider {
  const raw = process.env.NEXT_PUBLIC_STT_PROVIDER;
  // Dashboards happily store a stray space, newline or pair of quotes around a
  // value. A strict comparison turns any of those into a silent fall back to
  // Deepgram, which reads as "the variable was ignored" — so normalise, and
  // say so out loud when the value is set but means nothing.
  const value = raw?.trim().toLowerCase().replace(/^['"]|['"]$/g, "");

  if (value === "soniox") return "soniox";
  if (value && value !== "deepgram") {
    console.error(
      `[stt] NEXT_PUBLIC_STT_PROVIDER=${JSON.stringify(raw)} is not a known ` +
        `provider — using deepgram. Expected "soniox" or "deepgram".`
    );
  }
  return "deepgram";
}

async function mintToken(path: string, field: string): Promise<string> {
  const res = await fetch(path, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `token request failed (${res.status})`);
  }
  const body = await res.json();
  const token: unknown = body[field];
  if (typeof token !== "string" || !token) {
    throw new Error(
      `token response missing ${field}: ${JSON.stringify(body)}`
    );
  }
  return token;
}

// Shared socket lifecycle: resolve on open, reject with the close code if the
// handshake fails. `error` fires before `close` and carries nothing, so only
// `close` may settle the promise — otherwise the close code, the sole
// diagnostic a browser exposes, is lost.
function openSocket(
  url: string,
  protocols: string[] | undefined,
  onOpen: (socket: WebSocket) => void,
  onMessage: (data: unknown) => void,
  onClosedAfterOpen: (event: CloseEvent) => void
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = protocols
      ? new WebSocket(url, protocols)
      : new WebSocket(url);

    socket.onopen = () => {
      settled = true;
      onOpen(socket);
      resolve(socket);
    };
    socket.onerror = () => {
      console.warn("STT WebSocket error event (see close code below)");
    };
    socket.onclose = (event) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `STT WebSocket closed before opening (code ${event.code}${
              event.reason ? `: ${event.reason}` : ""
            })`
          )
        );
        return;
      }
      onClosedAfterOpen(event);
    };
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore non-JSON / unrecognized frames
      }
    };
  });
}

// Self-clearing: a socket the server drops mid-recording would otherwise
// leave this interval firing forever, since close() is only reached when the
// user stops.
function startKeepAlive(socket: WebSocket, message: string): number {
  const id = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
    else window.clearInterval(id);
  }, KEEPALIVE_INTERVAL_MS);
  return id;
}

async function connectDeepgram(cb: SttCallbacks): Promise<SttConnection> {
  const accessToken = await mintToken("/api/deepgram/token", "access_token");

  const params = new URLSearchParams({
    model: "nova-2",
    language: "fr",
    smart_format: "true",
    interim_results: "true",
    encoding: "linear16",
    sample_rate: String(SAMPLE_RATE),
    channels: "1",
    endpointing: "300",
  });

  let keepAlive: number | null = null;
  // close() and a dropped connection both surface as onclose; only the latter
  // should wake the caller's recovery path.
  let intentionalClose = false;

  const socket = await openSocket(
    `wss://api.deepgram.com/v1/listen?${params}`,
    ["bearer", accessToken],
    (s) => {
      keepAlive = startKeepAlive(s, JSON.stringify({ type: "KeepAlive" }));
    },
    (data) => {
      const msg = data as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };
      if (msg.type !== "Results") return;
      const transcript = msg.channel?.alternatives?.[0]?.transcript;
      if (!transcript) return;
      if (msg.is_final) {
        cb.onFinalDelta(` ${transcript}`);
        cb.onInterim("");
      } else {
        cb.onInterim(transcript);
      }
    },
    (event) => {
      if (!intentionalClose) cb.onDropped?.(event);
    }
  );

  return {
    sendFrame: (pcm) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
    },
    finalize: () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "Finalize" }));
      }
    },
    close: () => {
      intentionalClose = true;
      if (keepAlive !== null) window.clearInterval(keepAlive);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      }
      socket.close();
    },
  };
}

async function connectSoniox(cb: SttCallbacks): Promise<SttConnection> {
  const apiKey = await mintToken("/api/soniox/token", "api_key");

  let keepAlive: number | null = null;
  let intentionalClose = false;

  const socket = await openSocket(
    "wss://stt-rt.soniox.com/transcribe-websocket",
    undefined,
    (s) => {
      // Soniox authenticates in the first message rather than via a
      // subprotocol, and that message also carries the audio format. The VAD
      // feeds us raw 16-bit little-endian PCM, so declare it explicitly
      // instead of relying on container sniffing.
      s.send(
        JSON.stringify({
          api_key: apiKey,
          model: process.env.NEXT_PUBLIC_SONIOX_MODEL ?? "stt-rt-preview",
          audio_format: "s16le",
          sample_rate: SAMPLE_RATE,
          num_channels: 1,
          language_hints: ["fr"],
          enable_endpoint_detection: true,
        })
      );
      keepAlive = startKeepAlive(s, JSON.stringify({ type: "keepalive" }));
    },
    (data) => {
      const msg = data as {
        tokens?: { text?: string; is_final?: boolean }[];
        error_code?: number;
        error_message?: string;
      };
      if (msg.error_code) {
        console.error(
          `Soniox error ${msg.error_code}: ${msg.error_message ?? ""}`
        );
        return;
      }
      if (!Array.isArray(msg.tokens)) return;

      // Unlike Deepgram, finality is per token: finals arrive once and are
      // appended, while the non-final tail is the current interim.
      let finals = "";
      let interim = "";
      for (const t of msg.tokens) {
        if (t.is_final) finals += t.text ?? "";
        else interim += t.text ?? "";
      }
      if (finals) cb.onFinalDelta(finals);
      cb.onInterim(interim);
    },
    (event) => {
      if (!intentionalClose) cb.onDropped?.(event);
    }
  );

  return {
    sendFrame: (pcm) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
    },
    finalize: () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "finalize" }));
      }
    },
    close: () => {
      intentionalClose = true;
      if (keepAlive !== null) window.clearInterval(keepAlive);
      // An empty string is Soniox's end-of-stream signal.
      if (socket.readyState === WebSocket.OPEN) socket.send("");
      socket.close();
    },
  };
}

export function connectStt(
  provider: SttProvider,
  cb: SttCallbacks
): Promise<SttConnection> {
  // The audio socket runs browser-to-provider, so the server logs never show
  // which engine actually transcribed. State it where it happens, otherwise
  // the only way to tell them apart is a provider's billing page.
  console.info(
    `[stt] provider=${provider} endpoint=${
      provider === "soniox"
        ? "stt-rt.soniox.com"
        : "api.deepgram.com"
    }`
  );
  return provider === "soniox" ? connectSoniox(cb) : connectDeepgram(cb);
}
