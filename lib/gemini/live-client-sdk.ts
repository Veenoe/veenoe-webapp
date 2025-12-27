import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';
import { arrayBufferToBase64 } from './audio-utils';
import {
    processGeminiMessage,
    AudioPayload,
    TranscriptPayload,
    ToolCallPayload
} from './message-processor';

// Debug utility - disabled in production
const debug = process.env.NODE_ENV !== 'production'
    ? (...args: unknown[]) => console.log('[GeminiLiveClientSDK]', ...args)
    : () => { };

export interface GeminiLiveEventHandlers {
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: Error) => void;
    onAudioData?: (audioData: string, mimeType: string) => void;
    onTranscript?: (text: string, isFinal: boolean) => void;
    onSetupComplete?: () => void;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
    onTurnComplete?: () => void;
    onInterrupted?: () => void;
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
 * 
 * Design Decisions (First Principles):
 * 1. Exponential backoff for connection retries
 * 2. Debug utility for development logging
 * 3. Clean separation of connection and retry logic
 */
export class GeminiLiveClientSDK {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private session: any = null;
    private eventHandlers: GeminiLiveEventHandlers = {};
    private responseQueue: unknown[] = [];
    private isProcessing = false;
    private modelName: string;
    private retryConfig: RetryConfig;

    // Default model - can be overridden by backend
    private static readonly DEFAULT_MODEL = 'models/gemini-2.5-flash-native-audio-preview-09-2025';

    constructor(
        private apiKey: string,
        handlers: GeminiLiveEventHandlers = {},
        modelName?: string,
        retryConfig?: Partial<RetryConfig>
    ) {
        this.eventHandlers = handlers;
        this.modelName = modelName || GeminiLiveClientSDK.DEFAULT_MODEL;
        this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    }

    /**
     * Establishes a WebSocket connection with exponential backoff retry.
     * This is the primary method to call for connecting.
     */
    async connect(): Promise<void> {
        await this.connectWithRetry();
    }

    /**
     * Internal connection logic with retry support.
     */
    private async connectWithRetry(attempt = 0): Promise<void> {
        debug(`Initiating connection (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})...`);

        const isApiKey = this.apiKey.startsWith('AIza');
        const isEphemeralToken = this.apiKey.startsWith('auth_tokens/');

        if (!isApiKey && !isEphemeralToken) {
            debug('Invalid credentials format');
            this.eventHandlers.onError?.(new Error('Invalid credentials format'));
            return;
        }

        const ai = new GoogleGenAI({
            apiKey: this.apiKey,
            httpOptions: { apiVersion: 'v1alpha' }
        });

        const model = this.modelName;

        const config = {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: 'Puck',
                    },
                },
            },
        };

        try {
            debug("Connecting to model:", model);
            this.session = await ai.live.connect({
                model,
                callbacks: {
                    onopen: () => {
                        debug('Connection established');
                        this.eventHandlers.onConnected?.();
                    },
                    onmessage: (message: unknown) => {
                        this.responseQueue.push(message);
                        if (!this.isProcessing) {
                            this.processMessages();
                        }
                    },
                    onerror: (e: unknown) => {
                        debug('Connection error:', e);
                        this.eventHandlers.onError?.(new Error(String(e)));
                    },
                    onclose: () => {
                        debug('Connection closed');
                        this.eventHandlers.onDisconnected?.();
                    },
                },
                config,
            });
        } catch (error) {
            debug("Connection failed:", error);

            // Check if we should retry
            if (attempt < this.retryConfig.maxRetries) {
                const delay = Math.min(
                    this.retryConfig.baseDelayMs * Math.pow(2, attempt),
                    this.retryConfig.maxDelayMs
                );
                debug(`Retrying in ${delay}ms...`);
                await this.delay(delay);
                return this.connectWithRetry(attempt + 1);
            }

            // Max retries exceeded - notify error
            this.eventHandlers.onError?.(
                error instanceof Error ? error : new Error('Connection failed after retries')
            );
        }
    }

    /**
     * Utility function for async delay.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Processes messages from the response queue using the message processor.
     */
    private async processMessages(): Promise<void> {
        this.isProcessing = true;

        while (this.responseQueue.length > 0) {
            const message = this.responseQueue.shift();
            const processedMessages = processGeminiMessage(message);

            for (const processed of processedMessages) {
                this.dispatchMessage(processed.type, processed.payload);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Dispatches processed messages to appropriate event handlers.
     */
    private dispatchMessage(type: string, payload: unknown): void {
        switch (type) {
            case 'setup_complete':
                console.log("[GeminiLiveClientSDK] Setup complete");
                this.eventHandlers.onSetupComplete?.();
                break;

            case 'interrupted':
                console.log("[GeminiLiveClientSDK] Interruption signal received");
                this.eventHandlers.onInterrupted?.();
                break;

            case 'transcript':
                const transcript = payload as TranscriptPayload;
                console.log(`[GeminiLiveClientSDK] Transcript (Final: ${transcript.isFinal})`);
                this.eventHandlers.onTranscript?.(transcript.text, transcript.isFinal);
                break;

            case 'audio':
                const audio = payload as AudioPayload;
                this.eventHandlers.onAudioData?.(audio.data, audio.mimeType);
                break;

            case 'turn_complete':
                console.log("[GeminiLiveClientSDK] Turn complete");
                this.eventHandlers.onTurnComplete?.();
                break;

            case 'tool_call':
                const toolCall = payload as ToolCallPayload;
                console.log(`[GeminiLiveClientSDK] Tool call: ${toolCall.name}`);
                this.eventHandlers.onToolCall?.(toolCall.name, toolCall.args);
                break;
        }
    }

    /**
     * Sends audio data to the Gemini Live API.
     */
    sendAudio(audioData: ArrayBuffer): void {
        if (!this.session) {
            console.warn("[GeminiLiveClientSDK] Cannot send audio: Session not active");
            return;
        }

        const base64Audio = arrayBufferToBase64(audioData);

        this.session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000',
            },
        });
    }

    /**
     * Sends text input to the Gemini Live API.
     */
    sendText(text: string): void {
        if (!this.session) {
            console.warn("[GeminiLiveClientSDK] Cannot send text: Session not active");
            return;
        }

        console.log(`[GeminiLiveClientSDK] Sending text: ${text}`);
        this.session.sendClientContent({
            turns: [text],
        });
    }

    /**
     * Disconnects the session.
     */
    disconnect(): void {
        console.log("[GeminiLiveClientSDK] Disconnecting...");
        if (this.session) {
            try {
                // @ts-ignore
                if (typeof this.session.close === 'function') this.session.close();
            } catch (e) {
                console.warn("[GeminiLiveClientSDK] Error closing session", e);
            }
            this.session = null;
        }
    }

    getConnectionState(): string {
        return this.session ? 'connected' : 'disconnected';
    }
}