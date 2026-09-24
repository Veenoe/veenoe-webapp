"use client";

import { useEffect, useState, useTransition } from "react";
import { voiceTelemetry, DiagnosticsSnapshot } from "@/lib/telemetry/voice-telemetry";
import { Activity, ChevronDown, ChevronUp, Copy, Check, Terminal, Wifi } from "lucide-react";

/**
 * Developer Voice Diagnostics Panel (VEENOE-16)
 *
 * Gated by:
 * - NODE_ENV !== "production", OR
 * - NEXT_PUBLIC_VOICE_DIAGNOSTICS === "true"
 *
 * Performance considerations:
 * - Renders zero heavy components.
 * - Subscribes to throttled telemetry updates (max 2Hz when open).
 * - High-frequency audio packets do not trigger component re-renders.
 */
export function VoiceDiagnosticsPanel() {
  const isEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_VOICE_DIAGNOSTICS === "true";

  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>(() => voiceTelemetry.getSnapshot());
  const [copied, setCopied] = useState(false);
  const [pinged, setPinged] = useState(false);
  const [, startTransition] = useTransition();

  // Throttle polling while open, plus subscribe to significant telemetry events
  useEffect(() => {
    if (!isEnabled) return;

    const updateSnapshot = () => {
      startTransition(() => {
        setSnapshot(voiceTelemetry.getSnapshot());
      });
    };

    // Immediate initial snapshot
    updateSnapshot();

    // Subscribe to significant telemetry lifecycle events
    const unsubscribe = voiceTelemetry.subscribe(updateSnapshot);

    // Light interval polling (500ms) only when panel is expanded to update packets/sec
    let interval: NodeJS.Timeout | null = null;
    if (isOpen) {
      interval = setInterval(updateSnapshot, 500);
    }

    return () => {
      unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, [isEnabled, isOpen]);

  if (!isEnabled) {
    return null;
  }

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy telemetry JSON", e);
    }
  };

  const handlePing = () => {
    voiceTelemetry.sendTestPing();
    setPinged(true);
    setTimeout(() => setPinged(false), 2000);
  };

  const lastTurn = snapshot.lastTurnMetrics;

  const connectionBadgeColor =
    snapshot.connectionState === "connected"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : snapshot.connectionState === "starting"
      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
      : snapshot.connectionState === "error"
      ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono text-xs select-none max-w-sm w-full transition-all">
      {/* Minimized Pill / Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3 py-2 bg-card/95 backdrop-blur border border-border shadow-lg rounded-lg cursor-pointer hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span className="font-semibold text-foreground tracking-tight">Voice v2 Diagnostics</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${connectionBadgeColor}`}>
            {snapshot.connectionState}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          {snapshot.currentTurn > 0 && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
              Turn #{snapshot.currentTurn}
            </span>
          )}
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded Diagnostics Drawer */}
      {isOpen && (
        <div className="mt-2 p-3 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Header Action Row */}
          <div className="flex items-center justify-between pb-2 border-b border-border/60 text-muted-foreground text-[11px]">
            <div className="flex items-center gap-1.5 truncate max-w-[200px]">
              <Wifi className="h-3 w-3 shrink-0" />
              {snapshot.studentName ? (
                <span className="truncate text-foreground font-semibold" title={snapshot.studentName}>
                  {snapshot.studentName}
                </span>
              ) : (
                <span className="font-mono text-foreground truncate max-w-[120px]" title={snapshot.telemetrySessionId}>
                  {snapshot.telemetrySessionId.slice(0, 8)}...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePing}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors cursor-pointer text-[10px]"
                title="Send a test ping event to PostHog"
              >
                {pinged ? <Check className="h-3 w-3 text-emerald-500" /> : <Terminal className="h-3 w-3" />}
                {pinged ? "Sent!" : "Ping PostHog"}
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer text-[10px]"
                title="Copy telemetry JSON snapshot"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
          </div>

          {/* Setup & Connection Row */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-muted/40 p-2 rounded border border-border/40">
              <span className="text-muted-foreground block text-[10px]">Setup Latency</span>
              <span className="font-bold text-foreground">
                {snapshot.connectionSetupMs !== null ? `${snapshot.connectionSetupMs} ms` : "—"}
              </span>
            </div>
            <div className="bg-muted/40 p-2 rounded border border-border/40">
              <span className="text-muted-foreground block text-[10px]">Active Model</span>
              <span className="font-semibold text-foreground truncate block text-[10px]" title={snapshot.modelName || "Default"}>
                {snapshot.modelName ? snapshot.modelName.replace("models/", "") : "Gemini Live"}
              </span>
            </div>
          </div>

          {/* Latency Pipeline (Last Turn) */}
          <div className="space-y-1.5 bg-muted/20 p-2 rounded-md border border-border/40">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Turn Latency Pipeline {lastTurn ? `(Turn #${lastTurn.turnNumber})` : ""}
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground" title="Elapsed ms from last microphone PCM packet sent to first audio chunk received. True speech-end latency pending client VAD in VEENOE-19.">
                  Transport turnaround:
                </span>
                <span className="font-bold text-foreground">
                  {lastTurn?.lastInputPacketToFirstGeminiAudioMs !== null && lastTurn?.lastInputPacketToFirstGeminiAudioMs !== undefined
                    ? `${lastTurn.lastInputPacketToFirstGeminiAudioMs} ms`
                    : "—"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Gemini -&gt; Playback:</span>
                <span className="font-bold text-foreground">
                  {lastTurn?.firstGeminiAudioToPlaybackMs !== null && lastTurn?.firstGeminiAudioToPlaybackMs !== undefined
                    ? `${lastTurn.firstGeminiAudioToPlaybackMs} ms`
                    : "—"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">True Speech End -&gt; Audio:</span>
                <span className="text-muted-foreground italic text-[10px]">
                  unavailable (no VAD)
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Interruption -&gt; Stop:</span>
                <span className="font-bold text-foreground">
                  {lastTurn?.interruptionToPlaybackStopMs !== null && lastTurn?.interruptionToPlaybackStopMs !== undefined
                    ? `${lastTurn.interruptionToPlaybackStopMs} ms`
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Transport & Audio Metrics */}
          <div className="space-y-1.5 bg-muted/20 p-2 rounded-md border border-border/40">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Microphone & Playback Transport
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Packets/sec:</span>
                <span className="font-medium text-foreground">
                  {lastTurn?.packetsPerSecond !== null && lastTurn?.packetsPerSecond !== undefined
                    ? `~${lastTurn.packetsPerSecond}`
                    : "—"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Packet:</span>
                <span className="font-medium text-foreground">
                  {lastTurn?.estimatedPacketDurationMs !== null && lastTurn?.estimatedPacketDurationMs !== undefined
                    ? `${lastTurn.estimatedPacketDurationMs} ms`
                    : "—"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Input Packets:</span>
                <span className="font-medium text-foreground">{snapshot.totalInputPackets}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Output Chunks:</span>
                <span className="font-medium text-foreground">{snapshot.totalOutputChunks}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Queue:</span>
                <span className="font-medium text-foreground">
                  {lastTurn?.maxPlaybackQueueMs !== null && lastTurn?.maxPlaybackQueueMs !== undefined
                    ? `${Math.round(lastTurn.maxPlaybackQueueMs)} ms`
                    : "0 ms"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Underruns:</span>
                <span className="font-medium text-foreground">
                  {lastTurn?.playbackUnderrunCount || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Reliability Row */}
          <div className="flex justify-between items-center text-[10px] text-muted-foreground px-1">
            <span>Disconnects: <strong className="text-foreground">{snapshot.disconnectCount}</strong></span>
            <span>Errors: <strong className="text-foreground">{snapshot.connectionErrorCount}</strong></span>
            <span>Retries: <strong className="text-foreground">{snapshot.connectionRetryCount}</strong></span>
          </div>

          {/* Bounded Recent Event Timeline */}
          <div className="space-y-1.5 border-t border-border/60 pt-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Terminal className="h-3 w-3" />
              <span>Recent Events (Last {snapshot.recentEvents.length})</span>
            </div>

            <div className="max-h-36 overflow-y-auto bg-background/80 p-1.5 rounded border border-border/40 space-y-1 text-[10px]">
              {snapshot.recentEvents.length === 0 ? (
                <div className="text-muted-foreground/60 italic p-1">No events recorded yet</div>
              ) : (
                snapshot.recentEvents.map((evt) => (
                  <div key={evt.id} className="flex items-baseline justify-between font-mono gap-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-primary/70 shrink-0">+{evt.relTimeMs}ms</span>
                      <span className="text-foreground truncate">{evt.name}</span>
                    </div>
                    {evt.detail && (
                      <span className="text-muted-foreground/80 truncate max-w-[110px] shrink-0 text-right">
                        {evt.detail}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
