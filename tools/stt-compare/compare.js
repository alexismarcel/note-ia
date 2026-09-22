#!/usr/bin/env node
// Transcribes one audio file with Soniox and with Deepgram so the two can be
// compared on identical input. Standalone: no dependency on the app, no
// npm packages (Node 22 provides fetch/FormData/Blob).
//
// Usage: node compare.js <audio-file> [--only=soniox|deepgram]

import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const SONIOX_BASE = "https://api.soniox.com/v1";
const DEEPGRAM_BASE = "https://api.deepgram.com/v1";

const SONIOX_MODEL = process.env.SONIOX_MODEL ?? "stt-async-preview";
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL ?? "nova-2";
const LANGUAGE = process.env.STT_LANGUAGE ?? "fr";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const MIME_BY_EXT = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Always surface the raw body on failure: these APIs could not be exercised
// while this script was written, so an unexpected shape is the likeliest
// failure and the response text is what makes it fixable.
async function readBody(res) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function fail(label, res, body) {
  throw new Error(
    `${label} failed: HTTP ${res.status} ${res.statusText}\n${body.text.slice(0, 2000)}`
  );
}

async function transcribeSoniox(filePath, bytes) {
  const key = process.env.SONIOX_API_KEY;
  if (!key) throw new Error("SONIOX_API_KEY is not set");
  const auth = { Authorization: `Bearer ${key}` };

  process.stderr.write("[soniox] uploading…\n");
  const form = new FormData();
  // Content-Type is deliberately left to fetch so the multipart boundary is set.
  form.append("file", new Blob([bytes]), basename(filePath));

  const upRes = await fetch(`${SONIOX_BASE}/files`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const upBody = await readBody(upRes);
  if (!upRes.ok) fail("[soniox] file upload", upRes, upBody);

  const fileId = upBody.json?.id ?? upBody.json?.file_id;
  if (!fileId) {
    throw new Error(
      `[soniox] upload returned no file id: ${upBody.text.slice(0, 2000)}`
    );
  }

  process.stderr.write(`[soniox] creating transcription (${SONIOX_MODEL})…\n`);
  const createRes = await fetch(`${SONIOX_BASE}/transcriptions`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      file_id: fileId,
      model: SONIOX_MODEL,
      language_hints: [LANGUAGE],
      enable_speaker_diarization: false,
    }),
  });
  const createBody = await readBody(createRes);
  if (!createRes.ok) fail("[soniox] create transcription", createRes, createBody);

  const jobId = createBody.json?.id;
  if (!jobId) {
    throw new Error(
      `[soniox] create returned no id: ${createBody.text.slice(0, 2000)}`
    );
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = createBody.json?.status ?? "queued";
  while (status !== "completed") {
    if (Date.now() > deadline) {
      throw new Error(`[soniox] timed out while status was "${status}"`);
    }
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`${SONIOX_BASE}/transcriptions/${jobId}`, {
      headers: auth,
    });
    const pollBody = await readBody(pollRes);
    if (!pollRes.ok) fail("[soniox] poll", pollRes, pollBody);

    status = pollBody.json?.status;
    process.stderr.write(`[soniox] status=${status}\n`);
    if (status === "error" || status === "failed") {
      throw new Error(
        `[soniox] job failed: ${pollBody.json?.error_message ?? pollBody.text.slice(0, 2000)}`
      );
    }
  }

  const trRes = await fetch(`${SONIOX_BASE}/transcriptions/${jobId}/transcript`, {
    headers: auth,
  });
  const trBody = await readBody(trRes);
  if (!trRes.ok) fail("[soniox] get transcript", trRes, trBody);

  const text =
    trBody.json?.text ??
    (Array.isArray(trBody.json?.tokens)
      ? trBody.json.tokens.map((t) => t.text ?? "").join("")
      : null);

  if (text == null) {
    throw new Error(
      `[soniox] could not find transcript text in response: ${trBody.text.slice(0, 2000)}`
    );
  }
  return text.trim();
}

async function transcribeDeepgram(filePath, bytes) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");

  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: LANGUAGE,
    smart_format: "true",
  });
  const contentType =
    MIME_BY_EXT[extname(filePath).toLowerCase()] ?? "application/octet-stream";

  process.stderr.write(`[deepgram] transcribing (${DEEPGRAM_MODEL})…\n`);
  const res = await fetch(`${DEEPGRAM_BASE}/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
    body: bytes,
  });
  const body = await readBody(res);
  if (!res.ok) fail("[deepgram] listen", res, body);

  const text = body.json?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (text == null) {
    throw new Error(
      `[deepgram] no transcript in response: ${body.text.slice(0, 2000)}`
    );
  }
  return text.trim();
}

function summarise(text) {
  const words = text ? text.trim().split(/\s+/).length : 0;
  return `${words} mots, ${text.length} caractères`;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

  if (!filePath) {
    console.error("Usage: node compare.js <audio-file> [--only=soniox|deepgram]");
    process.exit(1);
  }

  const bytes = await readFile(filePath);
  console.error(
    `Fichier : ${filePath} (${(bytes.length / 1e6).toFixed(2)} Mo), langue=${LANGUAGE}\n`
  );

  const providers = [
    ["soniox", () => transcribeSoniox(filePath, bytes)],
    ["deepgram", () => transcribeDeepgram(filePath, bytes)],
  ].filter(([name]) => !only || only === name);

  const results = {};
  for (const [name, run] of providers) {
    const started = Date.now();
    try {
      results[name] = { text: await run(), ms: Date.now() - started };
    } catch (err) {
      results[name] = { error: err.message, ms: Date.now() - started };
    }
  }

  for (const [name, r] of Object.entries(results)) {
    console.log(`\n${"=".repeat(70)}\n${name.toUpperCase()}  (${r.ms} ms)\n${"=".repeat(70)}`);
    if (r.error) console.log(`ÉCHEC\n${r.error}`);
    else console.log(`${summarise(r.text)}\n\n${r.text}`);
  }

  const out = `stt-compare-${Date.now()}.json`;
  await writeFile(out, JSON.stringify({ filePath, language: LANGUAGE, results }, null, 2));
  console.log(`\nRésultats bruts écrits dans ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
