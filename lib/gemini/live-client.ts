/**
 * Gemini Live API WebSocket Client
 * Handles real-time bidirectional communication with Gemini Live API
 */

export enum MessageType {
    SETUP = "setup",
    CLIENT_CONTENT = "clientContent",
    SERVER_CONTENT = "serverContent",
    TOOL_CALL = "toolCall",
    TOOL_CALL_CANCELLATION = "toolCallCancellation",
    TOOL_RESPONSE = "toolResponse",
    REALTIME_INPUT = "realtimeInput",
    SETUP_COMPLETE = "setupComplete",
}

export interface AudioConfig {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
};

export enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    ERROR = "error",
}

export interface GeminiLiveEventHandlers {
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: Error) => void;
    onAudioData?: (audioData: ArrayBuffer) => void;
    onTranscript?: (text: string, isFinal: boolean) => void;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
    onServerMessage?: (message: unknown) => void;
}

export class GeminiLiveClient {
    private ws: WebSocket | null = null;
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private eventHandlers: GeminiLiveEventHandlers = {};
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;
    private reconnectDelay = 1000;

    // Hardcoded model name to match backend
    private readonly modelName = "gemini-2.5-flash-native-audio-preview-09-2025";

    constructor(
        private ephemeralToken: string,
        handlers: GeminiLiveEventHandlers = {}
    ) {
        this.eventHandlers = handlers;
    }

    async connect(): Promise<void> {
        if (this.connectionState === ConnectionState.CONNECTED) {
            return;
        }

        this.connectionState = ConnectionState.CONNECTING;

        try {
            // Use access_token for ephemeral tokens
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=${this.ephemeralToken}`;

            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = "arraybuffer";

            this.ws.onopen = () => this.handleOpen();
            this.ws.onmessage = (event) => this.handleMessage(event);
            this.ws.onerror = (error) => this.handleError(error);
            this.ws.onclose = () => this.handleClose();
        } catch (error) {
            this.connectionState = ConnectionState.ERROR;
            this.eventHandlers.onError?.(
                error instanceof Error ? error : new Error("Connection failed")
            );
        }
    }

    private handleOpen(): void {
        console.log("Connected to Gemini Live API");
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0;

        // CRITICAL: Send setup message immediately
        this.sendSetupMessage();

        this.eventHandlers.onConnected?.();
    }

    private sendSetupMessage(): void {
        if (!this.ws) return;

        const setupMessage = {
            setup: {
                model: this.modelName,
            }
        };

        console.log("Sending setup message", setupMessage);
        this.ws.send(JSON.stringify(setupMessage));
    }

    private handleMessage(event: MessageEvent): void {
        try {
            if (event.data instanceof ArrayBuffer) {
                this.eventHandlers.onAudioData?.(event.data);
                return;
            }
            const message = JSON.parse(event.data);
            this.processMessage(message);
        } catch (error) {
            console.error("Error processing message:", error);
        }
    }

    private processMessage(message: any): void {
        if (message.serverContent) {
            const content = message.serverContent;
            if (content.modelTurn?.parts) {
                for (const part of content.modelTurn.parts) {
                    if (part.text) {
                        this.eventHandlers.onTranscript?.(part.text, content.turnComplete || false);
                    }
                }
            }
            if (content.modelTurn?.parts) {
                for (const part of content.modelTurn.parts) {
                    if (part.inlineData?.data) {
                        const audioData = this.base64ToArrayBuffer(part.inlineData.data);
                        this.eventHandlers.onAudioData?.(audioData);
                    }
                }
            }
        }

        if (message.toolCall) {
            const toolCall = message.toolCall;
            this.eventHandlers.onToolCall?.(
                toolCall.functionCalls?.[0]?.name,
                toolCall.functionCalls?.[0]?.args || {}
            );
        }
        this.eventHandlers.onServerMessage?.(message);
    }

    private handleError(error: Event): void {
        console.error("WebSocket error:", error);
        this.connectionState = ConnectionState.ERROR;
        this.eventHandlers.onError?.(new Error("WebSocket error"));
    }

    private handleClose(): void {
        console.log("Disconnected from Gemini Live API");
        this.connectionState = ConnectionState.DISCONNECTED;
        this.eventHandlers.onDisconnected?.();

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
    }

    sendAudio(audioData: ArrayBuffer): void {
        // STRICT CHECK: Do not send if not fully ready
        if (
            this.connectionState !== ConnectionState.CONNECTED ||
            !this.ws ||
            this.ws.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        const base64Audio = this.arrayBufferToBase64(audioData);
        const message = {
            realtimeInput: {
                mediaChunks: [{
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Audio,
                }],
            },
        };

        try {
            this.ws.send(JSON.stringify(message));
        } catch (e) {
            console.warn("Failed to send audio frame", e);
        }
    }

    sendText(text: string): void {
        if (this.connectionState !== ConnectionState.CONNECTED || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const message = {
            clientContent: {
                turns: [{
                    role: "user",
                    parts: [{ text }],
                }],
                turnComplete: true,
            },
        };
        this.ws.send(JSON.stringify(message));
    }

    sendToolResponse(toolCallId: string, response: unknown): void {
        if (this.connectionState !== ConnectionState.CONNECTED || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const message = {
            toolResponse: {
                functionResponses: [{
                    id: toolCallId,
                    response,
                }],
            },
        };
        this.ws.send(JSON.stringify(message));
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = ConnectionState.DISCONNECTED;
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}