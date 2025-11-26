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

    async connect(): Promise<void> {
        // Check if this is an API key or ephemeral token
        const isApiKey = this.apiKey.startsWith('AIza');
        const isEphemeralToken = this.apiKey.startsWith('auth_tokens/');

        if (!isApiKey && !isEphemeralToken) {
            console.error('Invalid credentials. Expected API key (AIza...) or ephemeral token (auth_tokens/...), got:', this.apiKey.substring(0, 15));
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
            this.session = await ai.live.connect({
                model,
                callbacks: {
                    onopen: () => {
                        console.log('Connected to Gemini Live API');
                        this.eventHandlers.onConnected?.();
                    },
                    onmessage: (message: unknown) => {
                        this.responseQueue.push(message);
                        if (!this.isProcessing) {
                            this.processMessages();
                        }
                    },
                    onerror: (e: unknown) => {
                        console.error('Gemini Live API error:', e);
                        this.eventHandlers.onError?.(new Error(String(e)));
                    },
                    onclose: (e: unknown) => {
                        console.log('Disconnected from Gemini Live API');
                        this.eventHandlers.onDisconnected?.();
                    },
                },
                config,
            });
        } catch (error) {
            this.eventHandlers.onError?.(
                error instanceof Error ? error : new Error('Connection failed')
            );
        }
    }

    private async processMessages(): Promise<void> {
        this.isProcessing = true;

        while (this.responseQueue.length > 0) {
            const message = this.responseQueue.shift();

            if (message.setupComplete) {
                this.eventHandlers.onSetupComplete?.();
            }

            // Handle Server Content (Audio/Text)
            if (message.serverContent) {
                if (message.serverContent.modelTurn?.parts) {
                    for (const part of message.serverContent.modelTurn.parts) {
                        if (part.text) {
                            const isFinal = message.serverContent.turnComplete || false;
                            this.eventHandlers.onTranscript?.(part.text, isFinal);
                        }

                        if (part.inlineData?.data) {
                            this.eventHandlers.onAudioData?.(
                                part.inlineData.data,
                                part.inlineData.mimeType || 'audio/pcm;rate=24000'
                            );
                        }
                    }
                }

                if (message.serverContent.turnComplete) {
                    this.eventHandlers.onTurnComplete?.();
                }
            }

            // Handle Tool Calls
            if (message.toolCall) {
                const toolCalls = message.toolCall.functionCalls;
                if (toolCalls && toolCalls.length > 0) {
                    for (const call of toolCalls) {
                        this.eventHandlers.onToolCall?.(call.name, call.args);
                    }
                }
            }
        }

        this.isProcessing = false;
    }

    sendAudio(audioData: ArrayBuffer): void {
        if (!this.session) return;

        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(audioData);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        this.session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000',
            },
        });
    }

    sendText(text: string): void {
        if (!this.session) return;

        this.session.sendClientContent({
            turns: [text],
        });
    }

    disconnect(): void {
        if (this.session) {
            // Attempt graceful close if method exists, otherwise nullify
            try {
                // Some SDK versions might not expose close directly or it might be async
                // @ts-ignore
                if (typeof this.session.close === 'function') this.session.close();
            } catch (e) {
                console.warn("Error closing session", e);
            }
            this.session = null;
        }
    }

    getConnectionState(): string {
        return this.session ? 'connected' : 'disconnected';
    }
}