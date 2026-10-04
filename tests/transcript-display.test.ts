import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { TranscriptDisplay } from "../components/viva/TranscriptDisplay";
import { processGeminiMessage } from "../lib/gemini/message-processor";
import { TranscriptAssembler } from "../lib/gemini/transcript-assembler";
import { useVivaStore } from "../lib/store/viva-store";
import { ConversationState, PlaybackState } from "../types/viva";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
let ui: typeof import("@testing-library/react");
const props = {
    isConnecting: false,
    isConcluding: false,
    conversationState: ConversationState.LISTENING,
    playbackState: PlaybackState.IDLE,
};

before(async () => {
    for (const name of ["window", "document", "navigator", "HTMLElement"] as const) {
        Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
    }
    ui = await import("@testing-library/react");
});
afterEach(() => {
    ui.cleanup();
    useVivaStore.getState().resetSession();
});
after(() => dom.window.close());

test("Live input previews, corrections and interrupted responses reach the display without losing segments", () => {
    function Display() {
        const transcripts = useVivaStore((state) => state.transcripts);
        return createElement(TranscriptDisplay, { ...props, transcripts });
    }
    const view = ui.render(createElement(Display));
    const assembler = new TranscriptAssembler((entry) => useVivaStore.getState().upsertTranscript(entry));
    const receive = (serverContent: unknown) => ui.act(() => {
        for (const event of processGeminiMessage({ serverContent })) {
            if (event.type === "transcription") assembler.accept(event);
            if (event.type === "interrupted") assembler.interruptOutput();
            if (event.type === "turn_complete") assembler.closeOutputTurn();
        }
    });

    assert.ok(view.getByText("Listening..."));
    receive({ outputTranscription: { text: "Explain photosynthesis." } });
    receive({ interrupted: true, interimInputTranscription: { text: "Plants use water" } });
    assert.ok(view.getByText("Plants use water"));
    assert.ok(view.getByText("You"));
    assert.ok(view.getByText("Veenoe"));
    receive({ interimInputTranscription: { text: "Plants use sunlight" } });
    assert.equal(view.queryByText("Plants use water"), null);
    receive({ inputTranscription: { text: "Plants use sunlight." } });
    receive({ inputTranscription: { text: "And carbon dioxide." }, turnComplete: true });
    assert.equal(view.queryByText("Plants use sunlight"), null);
    assert.ok(view.getByText("Plants use sunlight."));
    assert.ok(view.getByText("And carbon dioxide."));
    assert.ok(view.getByText("Explain photosynthesis."));
    assert.equal(view.getAllByRole("listitem").length, 3);

    ui.act(() => useVivaStore.getState().resetSession());
    assert.equal(view.queryByRole("region", { name: "Live transcript" }), null);
    assert.ok(view.getByText("Listening..."));
});

test("conclusion status keeps both speakers visible and following pauses while reading older text", () => {
    const entry = { id: "user-1", role: "user" as const, text: "My answer", timestamp: 0, isFinal: false };
    const view = ui.render(createElement(TranscriptDisplay, { ...props, transcripts: [entry] }));
    const viewport = view.getByRole("region", { name: "Live transcript" });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 200 });
    viewport.scrollTop = 0;
    ui.fireEvent.scroll(viewport);
    view.rerender(createElement(TranscriptDisplay, { ...props, isConcluding: true, transcripts: [{ ...entry, text: "My revised answer" }] }));
    assert.equal(viewport.scrollTop, 0);
    assert.ok(view.getByText("Evaluating your performance..."));
    assert.ok(view.getByText("My revised answer"));
    viewport.scrollTop = 400;
    ui.fireEvent.scroll(viewport);
    view.rerender(createElement(TranscriptDisplay, { ...props, transcripts: [entry] }));
    assert.equal(viewport.scrollTop, 600);
});
