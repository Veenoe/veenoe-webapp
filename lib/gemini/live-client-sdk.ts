import {
  GoogleGenAI,
  Modality,
  type LiveConnectConfig,
  type LiveSendClientContentParameters,
  type Session,
  type LiveServerMessage,
} from "@google/genai";
import { arrayBufferToBase64 } from "./audio-utils";
import { processGeminiMessage, type GeminiEvent } from "./message-processor";
import {
  LiveRecovery,
  type LiveRecoveryOptions,
  type RecoveryReason,
} from "./live-recovery";

// Debug utility - disabled in production
const debug =
  process.env.NODE_ENV !== "production"
    ? (...args: unknown[]) => console.log("[GeminiLiveClientSDK]", ...args)
    : () => {};

export interface GeminiLiveEventHandlers {
  onEvent?: (event: GeminiEvent) => void;
  // Compatibility callbacks still drive existing audio and lifecycle owners.
  // New protocol consumers use onEvent; do not handle the same fact in both.
  // Remove these callbacks when the session hook has fully migrated.
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onAudioData?: (audioData: string, mimeType: string) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onSetupComplete?: () => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onReconnectAttempt?: (attempt: number) => void;
  onReconnecting?: (reason: RecoveryReason) => void;
  onRecovered?: (reason: RecoveryReason, elapsedMs: number) => void;
}

export const GEMINI_LIVE_API_VERSION = "v1beta";

/** Supply connection-specific recovery state while token constraints retain audio policy. */
export function createGeminiLiveConfig(
  resumptionEnabled = false,
  handle?: string,
): LiveConnectConfig {
  // Token constraints own audio policy; the client supplies only recovery state.
  return {
    responseModalities: [Modality.AUDIO],
    ...(resumptionEnabled
      ? { sessionResumption: handle ? { handle } : {} }
      : {}),
  };
}

/** Send control text as a completed user turn so Live starts a response. */
export function createGeminiClientContent(
  text: string,
): LiveSendClientContentParameters {
  return {
    turns: [{ role: "user", parts: [{ text }] }],
    turnComplete: true,
  };
}

/**
 * Configuration for connection retry behavior.
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * SDK Wrapper for Gemini Live API
 *
 * Handles connection, message processing, and state management.
 * Pure transport layer without third-party analytics coupling.
 */
export class GeminiLiveClientSDK {
  private session: Session | null = null;
  private transportOpen = false;
  private connectionGeneration = 0;
  private eventHandlers: GeminiLiveEventHandlers = {};
  private responseQueue: unknown[] = [];
  private isProcessing = false;
  private modelName: string;
  private retryConfig: RetryConfig;
  private recovery: LiveRecovery;
  private setupReady = false;
  private established = false;
  private terminal = false;
  private failAttempt: ((error: Error) => void) | null = null;

  /** Bind one credential and one recovery owner for the lifetime of a viva. */
  constructor(
    private apiKey: string,
    handlers: GeminiLiveEventHandlers = {},
    modelName?: string,
    retryConfig?: Partial<RetryConfig>,
    private options: LiveRecoveryOptions = {},
  ) {
    this.eventHandlers = handlers;
    this.modelName = modelName ?? "";
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.recovery = new LiveRecovery(
      options,
      {
        connect: async (handle, deadline) => {
          this.retireConnection();
          try {
            await this.openConnection(
              this.connectionGeneration,
              deadline,
              handle,
            );
          } catch (error) {
            this.retireConnection();
            throw error;
          }
        },
        onReconnecting: (reason) => {
          this.retireConnection();
          this.eventHandlers.onReconnecting?.(reason);
        },
        onAttempt: (attempt) =>
          this.eventHandlers.onReconnectAttempt?.(attempt),
        onRecovered: (reason, elapsedMs) =>
          this.eventHandlers.onRecovered?.(reason, elapsedMs),
        onFailure: () =>
          this.fatalFailure(
            "Connection could not be restored. Please start a new viva.",
          ),
      },
      this.retryConfig.baseDelayMs,
    );
  }

  /**
   * Establishes a WebSocket connection with exponential backoff retry.
   * This is the primary method to call for connecting.
   */
  async connect(): Promise<void> {
    const generation = ++this.connectionGeneration;
    await this.connectWithRetry(0, generation);
  }

  /**
   * Internal connection logic with retry support.
   */
  private async connectWithRetry(
    attempt: number,
    generation: number,
  ): Promise<void> {
    if (generation !== this.connectionGeneration) return;
    this.transportOpen = false;
    debug(
      `Initiating connection (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})...`,
    );

    if (!this.apiKey.startsWith("auth_tokens/") || !this.modelName) {
      debug("Invalid credentials format");
      this.fatalFailure("Missing Live session credential or model");
      return;
    }

    try {
      const deadline = Math.min(
        Date.now() + 10000,
        this.options.newSessionExpiresAt
          ? Date.parse(this.options.newSessionExpiresAt)
          : Infinity,
      );
      await this.openConnection(generation, deadline);
      if (generation === this.connectionGeneration) this.established = true;
    } catch {
      if (generation !== this.connectionGeneration) return;
      this.retireConnection();
      const retryGeneration = this.connectionGeneration;
      debug("Connection failed");

      // Check if we should retry
      if (attempt < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.baseDelayMs * Math.pow(2, attempt),
          this.retryConfig.maxDelayMs,
        );
        debug(`Retrying in ${delay}ms...`);
        this.eventHandlers.onReconnectAttempt?.(attempt + 1);
        if (retryGeneration !== this.connectionGeneration) return;
        await this.delay(delay);
        if (retryGeneration !== this.connectionGeneration) return;
        return this.connectWithRetry(attempt + 1, retryGeneration);
      }

      // Max retries exceeded - notify error
      this.fatalFailure("Gemini connection failed after retries");
    }
  }

  /** A usable connection requires both SDK ownership and setupComplete, in either order. */
  private async openConnection(
    generation: number,
    deadline: number,
    handle?: string,
  ): Promise<void> {
    this.setupReady = false;
    if (!Number.isFinite(deadline) || deadline <= Date.now())
      throw new Error("Connection deadline expired");
    let setupComplete!: () => void;
    const setup = new Promise<void>((resolve) => {
      setupComplete = resolve;
    });
    let rejectAttempt!: (error: Error) => void;
    const failed = new Promise<never>((_, reject) => {
      rejectAttempt = reject;
    });
    this.failAttempt = rejectAttempt;
    const timeout = setTimeout(
      () => rejectAttempt(new Error("Live setup timed out")),
      Math.min(10000, deadline - Date.now()),
    );
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: {
        apiVersion: this.options.apiVersion ?? GEMINI_LIVE_API_VERSION,
      },
    });
    const pending = ai.live
      .connect({
        model: this.modelName,
        config: createGeminiLiveConfig(this.options.resumptionEnabled, handle),
        callbacks: {
          onopen: () => {
            if (generation !== this.connectionGeneration) return;
            this.transportOpen = true;
            this.eventHandlers.onConnected?.();
          },
          onmessage: (message: LiveServerMessage) => {
            if (generation !== this.connectionGeneration) return;
            if (message.setupComplete !== undefined) {
              this.setupReady = true;
              setupComplete();
            }
            this.responseQueue.push(message);
            void this.processMessages();
          },
          onerror: () => {
            if (generation === this.connectionGeneration)
              this.transportFailure();
          },
          onclose: () => {
            if (generation === this.connectionGeneration)
              this.transportFailure();
          },
        },
      })
      .then((session) => {
        if (generation !== this.connectionGeneration) {
          session.close();
          return;
        }
        this.session = session;
      });
    try {
      await Promise.race([Promise.all([pending, setup]), failed]);
    } finally {
      clearTimeout(timeout);
      if (this.failAttempt === rejectAttempt) this.failAttempt = null;
    }
  }

  /** Setup failures reject their attempt; established connections enter bounded recovery. */
  private transportFailure(): void {
    this.transportOpen = false;
    if (this.terminal) return;
    if (this.failAttempt)
      this.failAttempt(new Error("Live transport closed during setup"));
    else if (this.established && this.options.resumptionEnabled)
      void this.recovery.recover("transport");
    else this.fatalFailure("Gemini transport error");
  }

  /** Retire resources before emitting one sanitized terminal error. */
  private fatalFailure(message: string): void {
    if (this.terminal) return;
    this.disconnect();
    this.eventHandlers.onError?.(new Error(message));
  }

  /** Once conclusion is accepted, report saving owns the remaining lifecycle. */
  stopRecovery(): void {
    this.terminal = true;
    this.recovery.stop();
  }

  /** Invalidate callbacks before closing so retired sockets cannot affect a newer connection. */
  private retireConnection(): void {
    this.connectionGeneration++;
    this.transportOpen = false;
    this.setupReady = false;
    this.responseQueue = [];
    const session = this.session;
    this.session = null;
    const failAttempt = this.failAttempt;
    this.failAttempt = null;
    failAttempt?.(new Error("Live connection retired"));
    try {
      session?.close();
    } catch {
      /* Teardown already invalidated its callbacks. */
    }
  }

  /**
   * Utility function for async delay.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Processes messages from the response queue using the message processor.
   */
  private async processMessages(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.responseQueue.length > 0) {
        const message = this.responseQueue.shift();
        const generation = this.connectionGeneration;
        try {
          for (const event of processGeminiMessage(message)) {
            if (generation !== this.connectionGeneration) break;
            try {
              this.dispatchMessage(event);
            } catch {
              this.reportProtocolIssue("handler");
            }
          }
        } catch {
          this.reportProtocolIssue("parser");
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.responseQueue.length) void this.processMessages();
    }
  }

  /** Report fixed field identifiers without leaking provider payloads or credentials. */
  private reportProtocolIssue(field: string): void {
    // Field names are fixed at the adapter boundary; no raw message data is logged.
    try {
      this.eventHandlers.onEvent?.({ type: "protocol_issue", field });
    } catch {
      console.error("[GeminiLiveClientSDK] Protocol observer failed");
    }
  }

  /**
   * Dispatches processed messages to appropriate event handlers.
   */
  private dispatchMessage(event: GeminiEvent): void {
    try {
      this.eventHandlers.onEvent?.(event);
    } catch {
      this.reportProtocolIssue("handler");
    }
    switch (event.type) {
      case "resumption_update":
        this.recovery.update(event.resumable, event.newHandle);
        break;
      case "go_away":
        this.recovery.goAway(event.timeLeft);
        break;
      case "setup_complete":
        console.log("[GeminiLiveClientSDK] Setup complete");
        if (!this.established) this.eventHandlers.onSetupComplete?.();
        break;

      case "interrupted":
        console.log("[GeminiLiveClientSDK] Interruption signal received");
        this.eventHandlers.onInterrupted?.();
        break;

      case "transcription": {
        if (event.source === "output" && event.text !== undefined)
          this.eventHandlers.onTranscript?.(
            event.text,
            event.finished === true,
          );
        break;
      }

      case "audio": {
        this.eventHandlers.onAudioData?.(event.data, event.mimeType);
        break;
      }

      case "turn_complete":
        console.log("[GeminiLiveClientSDK] Turn complete");
        this.eventHandlers.onTurnComplete?.();
        this.recovery.turnBoundary();
        break;

      case "tool_call": {
        this.eventHandlers.onToolCall?.(event.name, event.args);
        break;
      }
    }
  }

  /** Outgoing responses are correlated to a server call; terminal conclude_viva is never acknowledged. */
  sendToolResponse(
    id: string,
    name: string,
    response: Record<string, unknown>,
  ): boolean {
    if (!id || !this.session || !this.transportOpen || !this.setupReady)
      return false;
    try {
      this.session.sendToolResponse({
        functionResponses: [{ id, name, response }],
      });
      return true;
    } catch {
      this.transportOpen = false;
      this.transportFailure();
      return false;
    }
  }

  /** True means the open SDK session accepted the synchronous call, not network delivery. */
  sendAudio(
    audioData: ArrayBuffer,
    onSynchronousFailure?: () => void,
  ): boolean {
    if (!this.session || !this.transportOpen || !this.setupReady) {
      // Dropped microphone packets are counted by existing telemetry.
      // Recovery must neither queue them nor emit a log per packet.
      return false;
    }

    try {
      const base64Audio = arrayBufferToBase64(audioData);
      this.session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: "audio/pcm;rate=16000",
        },
      });
      return true;
    } catch {
      this.transportOpen = false;
      onSynchronousFailure?.();
      this.transportFailure();
      return false;
    }
  }

  /** True means the open SDK session accepted the synchronous call, not network delivery. */
  sendText(text: string): boolean {
    if (!this.session || !this.transportOpen || !this.setupReady) {
      console.warn(
        "[GeminiLiveClientSDK] Cannot send text: Session not active",
      );
      return false;
    }

    try {
      this.session.sendClientContent(createGeminiClientContent(text));
      return true;
    } catch {
      this.transportOpen = false;
      this.transportFailure();
      return false;
    }
  }

  /**
   * Disconnects the session.
   */
  disconnect(): void {
    this.terminal = true;
    this.recovery.stop();
    this.retireConnection();
    this.apiKey = "";
  }

  /** A socket is usable only after both SDK ownership and provider setup are ready. */
  getConnectionState(): "connected" | "disconnected" {
    return this.session && this.transportOpen && this.setupReady
      ? "connected"
      : "disconnected";
  }
}
