"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  CircleHelp,
  Headphones,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
} from "lucide-react";
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import type { Evaluation, Order, Proposal } from "@/lib/domain";
import { TranscriptDecoder, type Transcript } from "@/lib/voice/transcripts";
import { api, useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
type Session = {
  id: string;
  channel: string;
  token: string;
  uid: number;
  app_id: string;
  expires_at: string;
};
type SessionState = {
  status: string;
  tool_state: { running?: boolean; operation?: string };
  evaluation: Evaluation | null;
  proposal_id: string | null;
  selected_plan_key: string | null;
  last_error: string | null;
  expires_at: string;
};
export function VoicePanel({
  order,
  ready,
  onEvaluation,
  onProposal,
  onPlanSelected,
}: {
  order: Order;
  ready: boolean;
  onEvaluation: (evaluation: Evaluation) => void;
  onProposal: (proposal: Proposal) => void;
  onPlanSelected: (key: string) => void;
}) {
  const { workspace: w, refresh } = useWorkspace();
  const [state, setState] = useState<
      "disconnected" | "connecting" | "connected" | "reconnecting" | "ending"
    >("disconnected"),
    [muted, setMuted] = useState(false),
    [error, setError] = useState(""),
    [messages, setMessages] = useState<Transcript[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [operation, setOperation] = useState(""),
    [waitingSince, setWaitingSince] = useState<number | null>(null),
    [waitSeconds, setWaitSeconds] = useState(0),
    [lastSessionId, setLastSessionId] = useState<string | null>(null),
    [checking, setChecking] = useState(false),
    [volume, setVolume] = useState(0);
  const clientRef = useRef<IAgoraRTCClient | null>(null),
    trackRef = useRef<IMicrophoneAudioTrack | null>(null),
    sessionRef = useRef<Session | null>(null),
    mounted = useRef(true),
    starting = useRef(false),
    ending = useRef(false),
    lastEvaluation = useRef(""),
    lastProposal = useRef(""),
    lastSelection = useRef(""),
    callbacks = useRef({
      onEvaluation,
      onProposal,
      onPlanSelected,
      refresh,
      workspace: w,
    });
  useEffect(() => {
    callbacks.current = {
      onEvaluation,
      onProposal,
      onPlanSelected,
      refresh,
      workspace: w,
    };
  }, [onEvaluation, onProposal, onPlanSelected, refresh, w]);
  const release = useCallback(async () => {
    const track = trackRef.current;
    trackRef.current = null;
    track?.stop();
    track?.close();
    const client = clientRef.current;
    clientRef.current = null;
    if (client) {
      client.removeAllListeners();
      await client.leave().catch(() => {});
    }
  }, []);
  const end = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    if (mounted.current) {
      setState("ending");
      setOperation("");
      setWaitingSince(null);
    }
    await release();
    const current = sessionRef.current;
    try {
      if (current)
        await api("/api/voice/session", { id: current.id }, "DELETE");
      sessionRef.current = null;
      if (mounted.current) {
        setSession(null);
        setMuted(false);
        setVolume(0);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Agent stop failed. Retry ending the session.",
        );
    } finally {
      ending.current = false;
      if (mounted.current) setState("disconnected");
    }
  }, [release]);
  useEffect(() => {
    if (waitingSince === null) return;
    const timer = setInterval(
      () => setWaitSeconds(Math.floor((Date.now() - waitingSince) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [waitingSince]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void release();
      const current = sessionRef.current;
      if (current)
        void fetch("/api/voice/session", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: current.id }),
          keepalive: true,
        });
    };
  }, [release]);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await api<SessionState>(
          `/api/voice/session?id=${session.id}`,
          undefined,
          "GET",
        );
        if (cancelled) return;
        setOperation(
          s.tool_state.running
            ? (s.tool_state.operation ?? "Checking order records")
            : "",
        );
        if (s.last_error) setError(s.last_error);
        if (s.evaluation) {
          const signature = JSON.stringify(s.evaluation);
          if (signature !== lastEvaluation.current) {
            lastEvaluation.current = signature;
            lastSelection.current = "";
            callbacks.current.onEvaluation(s.evaluation);
          }
        }
        if (
          s.selected_plan_key &&
          s.selected_plan_key !== lastSelection.current
        ) {
          lastSelection.current = s.selected_plan_key;
          callbacks.current.onPlanSelected(s.selected_plan_key);
        } else if (!s.selected_plan_key) lastSelection.current = "";
        if (s.proposal_id && s.proposal_id !== lastProposal.current) {
          await callbacks.current.refresh();
          const result = await api<import("@/lib/domain").Workspace>(
            "/api/workspace",
            undefined,
            "GET",
          );
          const p = result.change_proposals.find((p) => p.id === s.proposal_id);
          if (p) {
            lastProposal.current = p.id;
            callbacks.current.onProposal(p);
          }
        }
        if (
          Date.parse(s.expires_at) <= Date.now() ||
          ["ended", "failed"].includes(s.status)
        )
          void end();
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Cannot refresh conversation context.",
          );
      }
    };
    const timer = setInterval(() => void poll(), 1500);
    const expiry = setTimeout(
      () => {
        setError(
          "The 10-minute session limit was reached. Reconnect to continue with current records.",
        );
        void end();
      },
      Math.max(1, Date.parse(session.expires_at) - Date.now()),
    );
    const meter = setInterval(
      () => setVolume(trackRef.current?.getVolumeLevel() ?? 0),
      150,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(expiry);
      clearInterval(meter);
    };
  }, [session, end]);
  const start = async () => {
    if (starting.current || ending.current) return;
    starting.current = true;
    setError("");
    setState("connecting");
    lastEvaluation.current = "";
    lastProposal.current = "";
    lastSelection.current = "";
    try {
      if (sessionRef.current) {
        await end();
        if (sessionRef.current)
          throw new Error("End the previous agent before starting again.");
        setState("connecting");
      }
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone access requires HTTPS or localhost and a supported browser.",
        );
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
      AgoraRTC.setLogLevel(3);
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        ANS: true,
        AGC: true,
      });
      trackRef.current = track;
      if (!mounted.current) {
        await release();
        return;
      }
      const rtc = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = rtc;
      const decoder = new TranscriptDecoder();
      rtc.on("stream-message", (_uid, data) => {
        try {
          const message = decoder.decode(data);
          if (message && mounted.current) {
            if (message.role === "user") {
              setWaitingSince(Date.now());
              setWaitSeconds(0);
            } else setWaitingSince(null);
          }
          if (message && mounted.current)
            setMessages((prev) => {
              const index = prev.findIndex((m) => m.id === message.id);
              if (index < 0) return [...prev, message].slice(-100);
              return prev.map((m, i) => (i === index ? message : m));
            });
        } catch {
          if (mounted.current)
            setError(
              "A transcript message could not be decoded. Audio and order controls remain available.",
            );
        }
      });
      rtc.on("user-published", async (user, type) => {
        try {
          await rtc.subscribe(user, type);
          if (type === "audio") user.audioTrack?.play();
        } catch {
          if (mounted.current)
            setError(
              "Agent audio could not play. Check browser audio permission, then reconnect.",
            );
        }
      });
      rtc.on("connection-state-change", (current, previous) => {
        if (!mounted.current || ending.current) return;
        if (current === "RECONNECTING") setState("reconnecting");
        if (current === "CONNECTED") {
          setState("connected");
          if (previous === "RECONNECTING") void callbacks.current.refresh();
        }
        if (current === "DISCONNECTED" && previous !== "DISCONNECTED") {
          setError(
            "Voice disconnected. Your order context is saved; reconnect to continue.",
          );
          void end();
        }
      });
      rtc.on("token-privilege-will-expire", () => {
        setError(
          "Voice credentials are expiring. Reconnect to start a new bounded session.",
        );
        void end();
      });
      const result = await api<Session>("/api/voice/session", {
        order_id: order.id,
      });
      sessionRef.current = result;
      if (!mounted.current) {
        await api("/api/voice/session", { id: result.id }, "DELETE");
        await release();
        return;
      }
      setSession(result);
      setLastSessionId(result.id);
      setMessages([]);
      await rtc.join(result.app_id, result.channel, result.token, result.uid);
      await rtc.publish(track);
      setState("connected");
      setMuted(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Voice could not connect. Check microphone permissions and retry.",
      );
      await end();
    } finally {
      starting.current = false;
    }
  };
  const connected = state === "connected" || state === "reconnecting";
  return (
    <aside className="voice-panel">
      <div className="voice-header">
        <div>
          <AudioLines size={19} />
          <h2>Talk it through</h2>
        </div>
        <span
          className={`badge ${state === "connected" ? "badge-green" : "badge-neutral"}`}
        >
          {state}
        </span>
      </div>
      <div className="voice-intro">
        <span className="voice-emblem">
          <AudioLines size={35} strokeWidth={1} />
        </span>
        <h3>
          A conversation.
          <br />
          Grounded in your order.
        </h3>
        <p>Ask what can change, what it affects, and what to do next.</p>
      </div>
      <div className="voice-session-controls">
        {connected ? (
          <>
            <div className="mic-meter">
              <Mic size={14} />
              <meter
                min="0"
                max="1"
                value={muted ? 0 : volume}
                aria-label="Microphone input level"
              />
              <span>{muted ? "Muted" : "Microphone on"}</span>
            </div>
            <div className="button-row">
              <Button
                variant="outline"
                aria-pressed={muted}
                onClick={async () => {
                  try {
                    await trackRef.current?.setMuted(!muted);
                    setMuted(!muted);
                  } catch {
                    setError(
                      "Microphone mute failed. End the conversation to release your microphone.",
                    );
                  }
                }}
              >
                {muted ? <MicOff size={16} /> : <Mic size={16} />}{" "}
                {muted ? "Unmute" : "Mute"}
              </Button>
              <Button variant="outline" onClick={() => void end()}>
                <PhoneOff size={15} />
                End
              </Button>
            </div>
          </>
        ) : ready ? (
          <Button
            disabled={state === "connecting" || state === "ending"}
            aria-busy={state === "connecting"}
            onClick={() => void start()}
          >
            {state === "connecting" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Mic size={16} />
            )}{" "}
            {state === "connecting"
              ? "Connecting..."
              : state === "ending"
                ? "Ending..."
                : "Start conversation"}
          </Button>
        ) : (
          <>
            <Button asChild variant="outline">
              <Link href="/setup">
                <Headphones size={16} />
                Set up live voice
              </Link>
            </Button>
            <p className="small muted">
              Use the change controls while voice is disconnected.
            </p>
          </>
        )}
        {session && state === "disconnected" && (
          <Button variant="outline" onClick={() => void end()}>
            <RefreshCw size={15} />
            Retry ending agent
          </Button>
        )}
        <span className="small muted">
          English / Microphone access required
        </span>
      </div>
      {error && (
        <div className="voice-error" role="alert">
          <p>{error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setError("");
              if (connected || sessionRef.current) await end();
              if (!sessionRef.current && ready) void start();
            }}
          >
            {connected ? "Reconnect" : "Retry"}
          </Button>
        </div>
      )}
      {operation && (
        <div className="tool-progress" role="status">
          <Loader2 size={15} className="spin" />
          {operation}
        </div>
      )}
      {connected && waitingSince !== null && !operation && (
        <div className="tool-progress" role="status">
          <Loader2 size={15} className="spin" />
          <p>
            {waitSeconds >= 12
              ? "The agent is taking longer than expected."
              : "Waiting for Nool's response..."}{" "}
            <span className="mono">{waitSeconds}s</span>
            {waitSeconds >= 12 && (
              <span className="cell-secondary">
                Check the provider response below, or continue with Evaluate
                change.
              </span>
            )}
          </p>
        </div>
      )}
      {lastSessionId && (!connected || waitSeconds >= 12) && (
        <Button
          variant="outline"
          size="sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              const result = await api<{ message: string }>(
                `/api/voice/diagnostics?id=${lastSessionId}`,
                undefined,
                "GET",
              );
              setError(result.message);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not check the provider response.",
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <CircleHelp size={14} />
          )}
          Check agent response
        </Button>
      )}
      <div className="transcript">
        <div className="section-heading">
          <h3>Live transcript</h3>
          {messages.length > 0 && (
            <span className="small muted">This session</span>
          )}
        </div>
        {messages.length ? (
          <div
            className="transcript-messages"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.map((m) => (
              <div
                className={`transcript-message transcript-${m.role}`}
                key={m.id}
              >
                <span>{m.role === "user" ? "You" : "Nool"}</span>
                <p>{m.text}</p>
                {!m.final && <small>Transcribing...</small>}
              </div>
            ))}
          </div>
        ) : (
          <div className="transcript-empty">
            <AudioLines size={23} />
            <p>Your conversation will appear here as you speak.</p>
          </div>
        )}
      </div>
      <details className="voice-prompts" open>
        <summary>
          <CircleHelp size={15} />
          Things you can ask
        </summary>
        <p>
          &ldquo;Can we increase this order to {order.quantity + 100}{" "}
          pieces?&rdquo;
        </p>
        <p>&ldquo;Would another production line help?&rdquo;</p>
        <p>&ldquo;What changes if we split the shipment?&rdquo;</p>
      </details>
      <div className="voice-footer">
        Recommendations are estimates.
        <br />
        Production approval makes the commitment.
      </div>
    </aside>
  );
}
