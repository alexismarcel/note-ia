"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MicVAD } from "@ricky0123/vad-web";
import { createClient } from "@/lib/supabase/client";
import { floatTo16BitPCM } from "@/lib/deepgram/pcm";
import { toErrorMessage } from "@/lib/errors";
import {
  connectStt,
  resolveProvider,
  type SttConnection,
} from "@/lib/stt/connect";

type Status =
  | "idle"
  | "initializing"
  | "listening"
  | "stopped"
  | "saving"
  | "error";

const PRE_BUFFER_FRAMES = 5;

export default function RecordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const vadRef = useRef<MicVAD | null>(null);
  const sttRef = useRef<SttConnection | null>(null);
  const isSpeakingRef = useRef(false);
  const preBufferRef = useRef<Float32Array[]>([]);

  const cleanup = useCallback(async () => {
    if (vadRef.current) {
      try {
        await vadRef.current.destroy();
      } catch (err) {
        // MicVAD.destroy() throws if start() never finished successfully
        // (e.g. the mic/token/socket setup failed first). That's expected
        // here and must not hide the real error from the caller.
        console.warn("MicVAD destroy skipped (was not fully started):", err);
      }
      vadRef.current = null;
    }
    if (sttRef.current) {
      sttRef.current.close();
      sttRef.current = null;
    }
    isSpeakingRef.current = false;
    preBufferRef.current = [];
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const sendFrame = useCallback((frame: Float32Array) => {
    sttRef.current?.sendFrame(floatTo16BitPCM(frame));
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setFinalTranscript("");
    setInterimTranscript("");
    setStatus("initializing");

    try {
      // 1. Request mic access / load the local VAD model first, closest to
      // the user gesture so the browser's permission prompt isn't delayed.
      const vad = await MicVAD.new({
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "/vad/",
        startOnLoad: false,
        onSpeechStart: () => {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
          for (const frame of preBufferRef.current) sendFrame(frame);
          preBufferRef.current = [];
        },
        onSpeechEnd: () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          sttRef.current?.finalize();
        },
        onVADMisfire: () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
        },
        onFrameProcessed: (_probabilities, frame) => {
          if (isSpeakingRef.current) {
            sendFrame(frame);
            return;
          }
          // Keep a short rolling buffer so the start of an utterance isn't
          // clipped while onSpeechStart is still debouncing.
          preBufferRef.current.push(frame);
          if (preBufferRef.current.length > PRE_BUFFER_FRAMES) {
            preBufferRef.current.shift();
          }
        },
      });
      vadRef.current = vad;

      // 2. Open the transcription stream. Which provider that is comes from
      // NEXT_PUBLIC_STT_PROVIDER, so a bad rollout is reverted by flipping an
      // environment variable rather than by shipping code.
      sttRef.current = await connectStt(resolveProvider(), {
        onFinalDelta: (text) => {
          setFinalTranscript((prev) => prev + text);
          setInterimTranscript("");
        },
        onInterim: setInterimTranscript,
      });

      // 3. Start the VAD only once the socket is ready to receive audio.
      await vad.start();
      setStatus("listening");
    } catch (err) {
      await cleanup();
      setErrorMessage(toErrorMessage(err));
      setStatus("error");
    }
  }, [cleanup, sendFrame]);

  const stopRecording = useCallback(async () => {
    await cleanup();
    setStatus("stopped");
  }, [cleanup]);

  const saveNote = useCallback(async () => {
    setStatus("saving");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const content = finalTranscript.trim();
      const { error } = await supabase.from("notes").insert({
        user_id: user.id,
        title: content.slice(0, 60) || "Note vocale",
        content,
        source_type: "audio",
      });
      if (error) throw error;

      router.push("/dashboard");
      // Without this the dashboard can be served from the client cache,
      // re-rendering the list as it was before this note existed.
      router.refresh();
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
      setStatus("stopped");
    }
  }, [finalTranscript, router]);

  const discardNote = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
    setStatus("idle");
  }, []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Nouvelle note vocale</h1>
        <p className="text-sm text-gray-500">
          Enregistre ton cours, la transcription apparaît en temps réel.
        </p>
      </div>

      <div className="flex items-center gap-4">
        {status !== "listening" ? (
          <button
            onClick={startRecording}
            disabled={status === "initializing" || status === "saving"}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700 disabled:opacity-50"
            aria-label="Démarrer l'enregistrement"
          >
            REC
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-900 text-white shadow hover:bg-gray-800"
            aria-label="Arrêter l'enregistrement"
          >
            STOP
          </button>
        )}

        <div className="text-sm">
          {status === "initializing" && (
            <span className="text-gray-500">Initialisation du micro…</span>
          )}
          {status === "listening" && (
            <span className={isSpeaking ? "text-red-600" : "text-gray-500"}>
              {isSpeaking ? "● Parole détectée" : "En écoute (silence)"}
            </span>
          )}
          {status === "stopped" && (
            <span className="text-gray-500">Enregistrement terminé.</span>
          )}
          {status === "saving" && (
            <span className="text-gray-500">Enregistrement de la note…</span>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="min-h-[200px] rounded-md border border-gray-200 p-4 text-sm leading-relaxed">
        {finalTranscript || interimTranscript ? (
          <p>
            {finalTranscript}{" "}
            <span className="text-gray-400">{interimTranscript}</span>
          </p>
        ) : (
          <p className="text-gray-400">La transcription s&apos;affichera ici…</p>
        )}
      </div>

      {status === "stopped" && (
        <div className="flex gap-3">
          <button
            onClick={saveNote}
            disabled={!finalTranscript.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Enregistrer la note
          </button>
          <button
            onClick={discardNote}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Ignorer
          </button>
        </div>
      )}
    </main>
  );
}
