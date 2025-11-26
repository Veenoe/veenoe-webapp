import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';

export interface GeminiLiveEventHandlers {
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: Error) => void;
    onAudioData?: (audioData: string, mimeType: string) => void; // base64 audio data
    onTranscript?: (text: string, isFinal: boolean) => void;
    onSetupComplete?: () => void;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
    onTurnComplete?: () => void;
}

/**
 * SDK Wrapper for Gemini Live API
 * Handles connection, message processing, and state management.
 */
export class GeminiLiveClientSDK {
    private session: any = null;
    private eventHandlers: GeminiLiveEventHandlers = {};
    private responseQueue: any[] = [];
    private isProcessing = false;

    constructor(
        private apiKey: string,
        handlers: GeminiLiveEventHandlers = {}
    ) {
        this.eventHandlers = handlers;
    }

    /**
     * Establishes a WebSocket connection to the Gemini Live API.
     */
    async connect(): Promise<void> {
        console.log("[GeminiLiveClientSDK] Initiating connection...");

        // Check if this is an API key or ephemeral token
        const isApiKey = this.apiKey.startsWith('AIza');
        const isEphemeralToken = this.apiKey.startsWith('auth_tokens/');

        if (!isApiKey && !isEphemeralToken) {
            console.error('[GeminiLiveClientSDK] Invalid credentials format. Expected API key or ephemeral token.');
            this.eventHandlers.onError?.(new Error('Invalid credentials format'));
            return;
        }

        // For ephemeral tokens, pass them as apiKey with v1alpha
        const ai = new GoogleGenAI({
            apiKey: this.apiKey,
            httpOptions: { apiVersion: 'v1alpha' }
        });

        // Using the native audio preview model optimized for latency
        const model = 'models/gemini-2.5-flash-native-audio-preview-09-2025';

        const config = {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: 'Puck', // Can be dynamic based on props
                    },
                },
            },
        };

        try {
            console.log("[GeminiLiveClientSDK] Connecting to model:", model);
            this.session = await ai.live.connect({
                model,
                callbacks: {
                    onopen: () => {
                        console.log('[GeminiLiveClientSDK] Connection established (onopen)');
                        this.eventHandlers.onConnected?.();
                    },
                    onmessage: (message: unknown) => {
                        // console.log('[GeminiLiveClientSDK] Message received from server'); // Verbose
                        this.responseQueue.push(message);
                        if (!this.isProcessing) {
                            this.processMessages();
                        }
                    },
                    onerror: (e: unknown) => {
                        console.error('[GeminiLiveClientSDK] Connection error:', e);
                        this.eventHandlers.onError?.(new Error(String(e)));
                    },
                    onclose: (e: unknown) => {
                        console.log('[GeminiLiveClientSDK] Connection closed (onclose)');
                        this.eventHandlers.onDisconnected?.();
                    },
                },
                config,
            });
        } catch (error) {
            console.error("[GeminiLiveClientSDK] Connection failed:", error);
            this.eventHandlers.onError?.(
                error instanceof Error ? error : new Error('Connection failed')
            );
        }
    }

    /**
     * Processes messages from the response queue sequentially.
     */
    private async processMessages(): Promise<void> {
        this.isProcessing = true;

        while (this.responseQueue.length > 0) {
            const message = this.responseQueue.shift();

            if (message.setupComplete) {
                console.log("[GeminiLiveClientSDK] Setup complete signal received");
                this.eventHandlers.onSetupComplete?.();
            }

            // Handle Server Content (Audio/Text)
            if (message.serverContent) {
                if (message.serverContent.modelTurn?.parts) {
                    for (const part of message.serverContent.modelTurn.parts) {
                        if (part.text) {
                            const isFinal = message.serverContent.turnComplete || false;
                            console.log(`[GeminiLiveClientSDK] Transcript received (Final: ${isFinal}): ${part.text.substring(0, 50)}...`);
                            this.eventHandlers.onTranscript?.(part.text, isFinal);
                        }

                        if (part.inlineData?.data) {
                            // console.log("[GeminiLiveClientSDK] Audio data received"); // Verbose
                            this.eventHandlers.onAudioData?.(
                                part.inlineData.data,
                                part.inlineData.mimeType || 'audio/pcm;rate=24000'
                            );
                        }
                    }
                }

                if (message.serverContent.turnComplete) {
                    console.log("[GeminiLiveClientSDK] Turn complete signal received");
                    this.eventHandlers.onTurnComplete?.();
                }
            }

            // Handle Tool Calls
            if (message.toolCall) {
                const toolCalls = message.toolCall.functionCalls;
                if (toolCalls && toolCalls.length > 0) {
                    for (const call of toolCalls) {
                        console.log(`[GeminiLiveClientSDK] Tool call received: ${call.name}`);
                        this.eventHandlers.onToolCall?.(call.name, call.args);
                    }
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * Sends audio data to the Gemini Live API.
     * @param audioData PCM audio data
     */
    sendAudio(audioData: ArrayBuffer): void {
        if (!this.session) {
            console.warn("[GeminiLiveClientSDK] Cannot send audio: Session not active");
            return;
        }

        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(audioData);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        // console.log(`[GeminiLiveClientSDK] Sending audio chunk (${bytes.byteLength} bytes)`); // Verbose

        this.session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000',
            },
        });
    }

    /**
     * Sends text input to the Gemini Live API.
     * @param text Text to send
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
            // Attempt graceful close if method exists, otherwise nullify
            try {
                // Some SDK versions might not expose close directly or it might be async
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