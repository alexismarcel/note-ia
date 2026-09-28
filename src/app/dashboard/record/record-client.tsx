"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MicVAD } from "@ricky0123/vad-web";
import { createClient } from "@/lib/supabase/client";
import { floatTo16BitPCM } from "@/lib/deepgram/pcm";
import { toErrorMessage } from "@/lib/errors";
import { formatNoteDate } from "@/lib/notes/title";
import CoursePicker, { type Filing } from "../course-picker";
import {
  connectStt,
  resolveProvider,
  type SttConnection,
} from "@/lib/stt/connect";

type Status =
  | "idle"
  | "initializing"
  | "listening"
  | "recovering"
  | "stopped"
  | "saving"
  | "error";

const PRE_BUFFER_FRAMES = 5;
const MAX_RECOVERY_ATTEMPTS = 6;
const RECOVERY_BASE_DELAY_MS = 1000;

// Mirrors @ricky0123/vad-web's own defaults. Supplying getStream replaces
// them wholesale, so anything missing here silently degrades capture.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  autoGainControl: true,
  noiseSuppression: true,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function RecordClient() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  // "Enregistrer dans cette matière" / "une séance" arrive as ?matiere=<id> or
  // ?cours=<id>, so the recording is filed before it starts. Read during render
  // rather than in an effect: an effect that calls setState only to copy the
  // URL in causes a second render for nothing.
  const searchParams = useSearchParams();
  const [filing, setFiling] = useState<Filing>({
    subjectId: searchParams.get("matiere"),
    courseId: searchParams.get("cours"),
  });

  const vadRef = useRef<MicVAD | null>(null);
  const sttRef = useRef<SttConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isSpeakingRef = useRef(false);
  const preBufferRef = useRef<Float32Array[]>([]);
  const recoveringRef = useRef(false);
  const stoppingRef = useRef(false);
  const statusRef = useRef<Status>("idle");
  // Track listeners outlive the render that created them, so they call through
  // a ref rather than capturing a stale recover().
  const interruptRef = useRef<(reason: string) => void>(() => {});

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const teardown = useCallback(async () => {
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
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    isSpeakingRef.current = false;
    preBufferRef.current = [];
    setIsSpeaking(false);
  }, []);

  const sendFrame = useCallback((frame: Float32Array) => {
    sttRef.current?.sendFrame(floatTo16BitPCM(frame));
  }, []);

  // Builds mic + socket. Deliberately touches no transcript state, so that
  // recovering after an interruption keeps everything captured so far.
  const openPipeline = useCallback(async () => {
    const vad = await MicVAD.new({
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      startOnLoad: false,
      getStream: async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
        });
        streamRef.current = stream;
        const [track] = stream.getAudioTracks();
        // A phone call or another app taking the microphone shows up here,
        // and is otherwise the recording's only warning that it has gone deaf.
        track?.addEventListener("ended", () =>
          interruptRef.current("micro libéré par le navigateur")
        );
        track?.addEventListener("mute", () =>
          interruptRef.current("micro coupé par une autre application")
        );
        return stream;
      },
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

    sttRef.current = await connectStt(resolveProvider(), {
      onFinalDelta: (text) => {
        setFinalTranscript((prev) => prev + text);
        setInterimTranscript("");
      },
      onInterim: setInterimTranscript,
      onDropped: (event) =>
        interruptRef.current(`connexion perdue (code ${event.code})`),
    });

    await vad.start();
  }, [sendFrame]);

  const recover = useCallback(
    async (reason: string) => {
      if (recoveringRef.current || stoppingRef.current) return;
      recoveringRef.current = true;
      setStatus("recovering");
      setErrorMessage(null);

      for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
        await teardown();
        // The microphone commonly stays busy for a while after a call ends,
        // so back off instead of spending every attempt in the first second.
        await sleep(RECOVERY_BASE_DELAY_MS * 2 ** (attempt - 1));
        if (stoppingRef.current) {
          recoveringRef.current = false;
          return;
        }
        try {
          await openPipeline();
          setStatus("listening");
          recoveringRef.current = false;
          return;
        } catch (err) {
          console.warn(`[record] recovery attempt ${attempt} failed:`, err);
        }
      }

      await teardown();
      recoveringRef.current = false;
      // "stopped", not "error": what was transcribed before the interruption
      // is still here, and the save button belongs on screen.
      setStatus("stopped");
      setErrorMessage(
        `Enregistrement interrompu (${reason}) et la reprise automatique a ` +
          `échoué. La transcription obtenue avant la coupure est conservée : ` +
          `tu peux l'enregistrer.`
      );
    },
    [openPipeline, teardown]
  );

  useEffect(() => {
    interruptRef.current = (reason: string) => {
      void recover(reason);
    };
  }, [recover]);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      teardown();
    };
  }, [teardown]);

  // Mobile browsers routinely skip track events while backgrounded, so verify
  // the microphone is still live whenever the tab comes back.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (statusRef.current !== "listening") return;
      const track = streamRef.current?.getAudioTracks()[0];
      if (!track || track.readyState === "ended" || track.muted) {
        interruptRef.current("micro indisponible au retour au premier plan");
      }
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  const startRecording = useCallback(async () => {
    stoppingRef.current = false;
    setErrorMessage(null);
    setFinalTranscript("");
    setInterimTranscript("");
    setStatus("initializing");

    try {
      await openPipeline();
      setStatus("listening");
    } catch (err) {
      await teardown();
      setErrorMessage(toErrorMessage(err));
      setStatus("error");
    }
  }, [openPipeline, teardown]);

  const stopRecording = useCallback(async () => {
    stoppingRef.current = true;
    await teardown();
    setStatus("stopped");
  }, [teardown]);

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
        // A slice of the transcript made for a title that read as noise. The
        // sheet renames the note properly; until then a date is all we honestly
        // have.
        title: `Note du ${formatNoteDate(new Date())}`,
        content,
        source_type: "audio",
        // null is a legitimate answer on both: a note can be filed later from
        // its own page. A matière without a cours is a complete filing.
        subject_id: filing.subjectId,
        course_id: filing.courseId,
      });
      if (error) throw error;

      // Land on the recordings list, not the hub: a save the user cannot see
      // land is the bug we already fixed once.
      router.push("/dashboard/enregistrements");
      // Without this the list can be served from the client cache, rendering
      // as it was before this note existed.
      router.refresh();
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
      setStatus("stopped");
    }
  }, [filing, finalTranscript, router]);

  const discardNote = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  const isRecording = status === "listening" || status === "recovering";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 sm:px-8">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Nouvelle note vocale
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Enregistre ton cours, la transcription apparaît en temps réel.
        </p>
      </div>

      {/* Kept visible during and after the recording: the choice can be made
          before starting, or once the lecture turns out to be about something
          else than planned. */}
      <CoursePicker mode="draft" value={filing} onChange={setFiling} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={status === "initializing" || status === "saving"}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-line-warm bg-white py-3 pl-4 pr-5 text-sm font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta-deep disabled:opacity-50 disabled:hover:border-line-warm disabled:hover:text-ink"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-terracotta" />
            Démarrer l&apos;enregistrement
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-terracotta bg-sand py-3 pl-4 pr-5 text-sm font-semibold text-terracotta-deep transition-colors hover:bg-cream"
          >
            {/* The halo sits behind the dot and is decorative; the label and
                the status text carry the meaning. */}
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="recording-halo absolute inset-0 rounded-full bg-terracotta" />
              <span className="recording-dot relative h-2.5 w-2.5 rounded-full bg-terracotta" />
            </span>
            Arrêter l&apos;enregistrement
          </button>
        )}

        <div className="text-sm">
          {status === "initializing" && (
            <span className="text-ink-soft">Initialisation du micro…</span>
          )}
          {status === "listening" && (
            <span className={isSpeaking ? "text-terracotta-deep" : "text-ink-soft"}>
              {isSpeaking ? "● Parole détectée" : "En écoute (silence)"}
            </span>
          )}
          {status === "recovering" && (
            <span className="text-clay">
              Interruption détectée — reprise en cours, la transcription est
              conservée…
            </span>
          )}
          {status === "stopped" && (
            <span className="text-ink-soft">Enregistrement terminé.</span>
          )}
          {status === "saving" && (
            <span className="text-ink-soft">Enregistrement de la note…</span>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="min-h-[200px] rounded-2xl border border-line-soft bg-white p-5 text-sm leading-relaxed text-ink">
        {finalTranscript || interimTranscript ? (
          <p>
            {finalTranscript}{" "}
            <span className="text-ink-faint">{interimTranscript}</span>
          </p>
        ) : (
          <p className="text-ink-faint">La transcription s&apos;affichera ici…</p>
        )}
      </div>

      {status === "stopped" && (
        <div className="flex gap-3">
          <button
            onClick={saveNote}
            disabled={!finalTranscript.trim()}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Enregistrer la note
          </button>
          <button
            onClick={discardNote}
            className="rounded-full border-[1.5px] border-line-warm px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
          >
            Ignorer
          </button>
        </div>
      )}
    </main>
  );
}
