import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { JSDOM } from "jsdom";

const require = createRequire(path.resolve("tests/viva-config-preference.test.ts"));
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
let ui: typeof import("@testing-library/react");
let useConfig: typeof import("../lib/hooks/viva/useVivaSessionConfig").useVivaSessionConfig;
let ClassSelector: typeof import("../components/viva/ClassLevelSelector").ClassLevelSelector;

before(async () => {
  for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLFormElement", "DocumentFragment", "MutationObserver", "Event", "HTMLSelectElement", "localStorage"] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  // Clerk is the external boundary; use the real setup hook and Radix class selector.
  const filename = require.resolve("@clerk/nextjs");
  const stub = new Module(filename);
  stub.exports = { useUser: () => ({ isLoaded: true, user: { fullName: "Student" } }) };
  stub.loaded = true;
  require.cache[filename] = stub;
  ui = await import("@testing-library/react");
  ({ useVivaSessionConfig: useConfig } = await import("../lib/hooks/viva/useVivaSessionConfig"));
  ({ ClassLevelSelector: ClassSelector } = await import("../components/viva/ClassLevelSelector"));
});

afterEach(() => { ui.cleanup(); localStorage.clear(); });
after(() => dom.window.close());

function Setup() {
  const { state, choices, actions } = useConfig(async () => { });
  return createElement("form", null,
    createElement(ClassSelector, {
      classLevel: String(state.selection.classLevel), classLevels: choices.classLevels,
      isOtherClass: false, otherClassValue: "", onOtherValueChange: () => { },
      onClassChange: actions.handleClassChange,
    }),
    createElement("output", null, state.curriculumError ?? (state.isCurriculumLoaded ? "Ready" : "Loading")),
  );
}

test("saved class and subjects survive remounting setup after a session", async () => {
  localStorage.setItem("veenoe_last_class", "7");
  const first = ui.render(createElement(Setup));
  await ui.waitFor(() => assert.equal(first.getByRole("combobox").textContent, "Class 7"));
  await ui.waitFor(() => assert.equal(first.getByRole("status").textContent, "Ready"));
  first.unmount();
  const next = ui.render(createElement(Setup));
  // An empty native change must not clear the controlled value on the returning form.
  const nativeSelect = next.container.querySelector("select");
  assert.ok(nativeSelect);
  ui.fireEvent.change(nativeSelect, { target: { value: "" } });
  await ui.waitFor(() => assert.equal(next.getByRole("status").textContent, "Ready"));
  assert.equal(next.getByRole("combobox").textContent, "Class 7");
  assert.equal(localStorage.getItem("veenoe_last_class"), "7");
});

test("invalid remembered classes fall back to the supported default", async () => {
  localStorage.setItem("veenoe_last_class", "Other");
  const { result } = ui.renderHook(() => useConfig(async () => { }));
  await ui.waitFor(() => assert.equal(result.current.state.isCurriculumLoaded, true));
  assert.equal(result.current.state.selection.classLevel, 5);
  ui.act(() => result.current.actions.dispatch({ type: "class", value: 0 }));
  assert.equal(result.current.state.selection.classLevel, 5);
  assert.equal(result.current.state.curriculumError, null);
});

test("empty or unsupported class events cannot overwrite a valid preference", async () => {
  localStorage.setItem("veenoe_last_class", "8");
  const { result } = ui.renderHook(() => useConfig(async () => { }));
  await ui.waitFor(() => assert.equal(result.current.state.selection.classLevel, 8));
  for (const value of ["", " ", "0", "4", "13", "Other", "7.5"]) {
    ui.act(() => result.current.actions.handleClassChange(value));
    assert.equal(result.current.state.selection.classLevel, 8);
    assert.equal(localStorage.getItem("veenoe_last_class"), "8");
  }
  ui.act(() => result.current.actions.handleClassChange("9"));
  await ui.waitFor(() => assert.equal(result.current.state.isCurriculumLoaded, true));
  assert.equal(result.current.state.selection.classLevel, 9);
  assert.equal(localStorage.getItem("veenoe_last_class"), "9");
});
