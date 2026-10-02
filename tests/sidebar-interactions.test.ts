import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import Module, { createRequire } from "node:module";
import path from "node:path";
import * as React from "react";
import { JSDOM } from "jsdom";

const require = createRequire(path.resolve("tests/sidebar-interactions.test.ts"));
const h = React.createElement;
let pathname = "/v/session-1";
const sessions = [{ viva_session_id: "session-1", title: "Law of crime", topic: "Crime", session_type: "viva" }];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost", pretendToBeVisual: true });
const mediaQueries = new Map<string, EventTarget>();

// Replace only service/framework boundaries; exercise the real React, Motion and Radix components.
function stubModule(specifier: string, exports: unknown) {
  const filename = require.resolve(specifier);
  const stub = new Module(filename);
  stub.exports = exports;
  stub.loaded = true;
  require.cache[filename] = stub;
}

let ui: typeof import("@testing-library/react");
let userEvent: typeof import("@testing-library/user-event").default;
let sidebar: typeof import("../components/ui/sidebar");
let SessionActionsMenu: typeof import("../components/sidebar/session-actions-menu").SessionActionsMenu;
let HistoryList: typeof import("../components/sidebar/history-list").HistoryList;
let AppSidebar: typeof import("../components/sidebar/app-sidebar").AppSidebar;

before(async () => {
  for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "NodeFilter", "MutationObserver", "CustomEvent", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "HTMLButtonElement", "SVGElement"] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: dom.window.requestAnimationFrame.bind(dom.window) });
  Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: dom.window.cancelAnimationFrame.bind(dom.window) });
  Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(dom.window, "PointerEvent", { configurable: true, value: dom.window.MouseEvent });
  dom.window.HTMLElement.prototype.scrollIntoView = () => { };
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  dom.window.HTMLElement.prototype.setPointerCapture = () => { };
  dom.window.HTMLElement.prototype.releasePointerCapture = () => { };
  dom.window.matchMedia = (query) => {
    const target = mediaQueries.get(query) ?? new dom.window.EventTarget();
    mediaQueries.set(query, target);
    return {
      get matches() { return query.includes("reduced-motion") || dom.window.innerWidth < 768; },
      media: query,
      onchange: null,
      addListener: (listener) => target.addEventListener("change", listener as EventListener),
      removeListener: (listener) => target.removeEventListener("change", listener as EventListener),
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    };
  };
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true, value: class {
      observe() { }
      unobserve() { }
      disconnect() { }
    }
  });

  stubModule("@clerk/nextjs", { useUser: () => ({ user: null }), useClerk: () => ({}) });
  stubModule("../lib/hooks/use-history", {
    useHistory: () => ({ data: { sessions }, isLoading: false }),
    useRenameSession: () => ({ mutate: mock.fn() }),
    useDeleteSession: () => ({ mutate: mock.fn() }),
  });
  stubModule("next/navigation", { usePathname: () => pathname });
  stubModule("next/link", {
    __esModule: true,
    default: React.forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(function Link(props, ref) {
      return h("a", {
        ...props, ref, onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          props.onClick?.(event);
          event.preventDefault();
        }
      });
    })
  });
  stubModule("next/image", { __esModule: true, default: (props: React.ComponentProps<"img">) => h("img", props) });

  ui = await import("@testing-library/react");
  userEvent = (await import("@testing-library/user-event")).default;
  sidebar = require("../components/ui/sidebar");
  SessionActionsMenu = require("../components/sidebar/session-actions-menu").SessionActionsMenu;
  HistoryList = require("../components/sidebar/history-list").HistoryList;
  AppSidebar = require("../components/sidebar/app-sidebar").AppSidebar;
});

beforeEach(() => {
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 1024 });
  pathname = "/v/session-1";
});

afterEach(() => ui.cleanup());
after(() => dom.window.close());

function renderMenu(onDelete = mock.fn(), onRename = mock.fn()) {
  ui.render(h(sidebar.SidebarProvider, null,
    h(sidebar.SidebarMenu, null, h(sidebar.SidebarMenuItem, null,
      h(SessionActionsMenu, { title: "Law of crime", onDelete, onRename })))));
  return { user: userEvent.setup(), onDelete, onRename };
}

test("Delete requires explicit confirmation; Cancel restores focus without deleting", async () => {
  const { user, onDelete } = renderMenu();
  await user.click(ui.screen.getByRole("button", { name: "More options for Law of crime" }));
  await user.click(ui.screen.getByRole("menuitem", { name: "Delete" }));
  assert.equal(onDelete.mock.callCount(), 0);
  const cancel = ui.screen.getByRole("menuitem", { name: "Cancel" });
  assert.ok(document.activeElement === cancel, "Cancel should receive focus");
  await user.click(cancel);
  assert.ok(document.activeElement === ui.screen.getByRole("menuitem", { name: "Delete" }), "Delete should regain focus");
  assert.equal(onDelete.mock.callCount(), 0);
  await user.click(ui.screen.getByRole("menuitem", { name: "Delete" }));
  await user.click(ui.screen.getByRole("menuitem", { name: "Yes, Delete" }));
  assert.equal(onDelete.mock.callCount(), 1);
  await ui.waitFor(() => assert.ok(!ui.screen.queryByRole("menu"), "Menu should be closed"));
});

test("Rename leaves focus on the editing input rather than the dots", async () => {
  function RenameHarness() {
    const [editing, setEditing] = React.useState(false);
    return editing
      ? h("input", { "aria-label": "Session title", autoFocus: true })
      : h(SessionActionsMenu, { title: "Law of crime", onRename: () => setEditing(true), onDelete: () => { } });
  }
  ui.render(h(sidebar.SidebarProvider, null, h(RenameHarness)));
  const user = userEvent.setup();
  await user.click(ui.screen.getByRole("button", { name: "More options for Law of crime" }));
  await user.click(ui.screen.getByRole("menuitem", { name: "Rename" }));
  await ui.waitFor(() => assert.ok(document.activeElement === ui.screen.getByRole("textbox", { name: "Session title" }), "Rename input should retain focus"));
  assert.ok(!ui.screen.queryByRole("menu"), "Menu should be closed");
});

test("keyboard Escape dismisses confirmation and reopening resets Delete", async () => {
  const { user, onDelete } = renderMenu();
  await user.click(ui.screen.getByRole("button", { name: "More options for Law of crime" }));
  await user.click(ui.screen.getByRole("menuitem", { name: "Delete" }));
  await user.keyboard("{Escape}");
  await ui.waitFor(() => assert.ok(!ui.screen.queryByRole("menu"), "Menu should be closed"));
  await user.click(ui.screen.getByRole("button", { name: "More options for Law of crime" }));
  assert.ok(ui.screen.getByRole("menuitem", { name: "Delete" }));
  assert.ok(!ui.screen.queryByRole("menuitem", { name: "Yes, Delete" }));
  assert.equal(onDelete.mock.callCount(), 0);
});

test("a programmatic change after a keyboard toggle gets its own animation policy", async () => {
  function Controls() {
    const { open, motionEnabled, setOpen } = sidebar.useSidebar();
    return h("button", { onClick: () => setOpen(true) }, `${open}:${motionEnabled}`);
  }
  ui.render(h(sidebar.SidebarProvider, null, h(Controls)));
  ui.fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  assert.ok(ui.screen.getByRole("button", { name: "false:false" }));
  // fireEvent.click deliberately sends no pointer-down to catch the previous temporal coupling.
  ui.fireEvent.click(ui.screen.getByRole("button"));
  assert.ok(ui.screen.getByRole("button", { name: "true:true" }));
});

test("mobile Search survives drawer unmount and opens after the drawer closes", async () => {
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 390 });
  function OpenDrawer() {
    const { setOpenMobile } = sidebar.useSidebar();
    return h("button", { onClick: () => setOpenMobile(true) }, "Open drawer");
  }
  ui.render(h(sidebar.SidebarProvider, null, h(OpenDrawer), h(AppSidebar)));
  const user = userEvent.setup();
  await user.click(ui.screen.getByRole("button", { name: "Open drawer" }));
  await user.click(ui.screen.getByRole("button", { name: "Search Sessions" }));
  await ui.waitFor(() => {
    const dialogs = ui.screen.getAllByRole("dialog");
    assert.equal(dialogs.length, 1);
    assert.equal(dialogs[0].getAttribute("aria-labelledby"), ui.screen.getByText("Search History").id);
    assert.ok(!document.querySelector('[data-mobile="true"]'));
  });
  const input = ui.screen.getByPlaceholderText("Search sessions...");
  await user.type(input, "law");
  assert.ok(ui.screen.getByRole("link", { name: "Law of crime" }));
});

test("mobile session navigation closes the drawer and identifies the current session", async () => {
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 390 });
  function OpenDrawer() {
    const { setOpenMobile } = sidebar.useSidebar();
    return h("button", { onClick: () => setOpenMobile(true) }, "Open drawer");
  }
  ui.render(h(sidebar.SidebarProvider, { defaultOpen: false }, h(OpenDrawer), h(sidebar.Sidebar, null, h(HistoryList))));
  const user = userEvent.setup();
  await user.click(ui.screen.getByRole("button", { name: "Open drawer" }));
  const session = ui.screen.getByRole("link", { name: "Law of crime" });
  assert.equal(session.getAttribute("aria-current"), "page");
  await user.click(session);
  await ui.waitFor(() => assert.ok(!ui.screen.queryByRole("dialog")));
});

test("collapsed history action expands the desktop sidebar", async () => {
  const { container } = ui.render(h(sidebar.SidebarProvider, { defaultOpen: false }, h(sidebar.Sidebar, { collapsible: "icon" }, h(HistoryList))));
  await userEvent.setup().click(ui.screen.getByRole("button", { name: "Show your sessions" }));
  assert.ok(container.querySelector('[data-slot="sidebar"][data-state="expanded"]'));
  assert.ok(ui.screen.getByRole("link", { name: "Law of crime" }));
});

test("mobile Sidebar forwards DOM attributes to content rather than Dialog.Root", async () => {
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 390 });
  function OpenDrawer() {
    const { setOpenMobile } = sidebar.useSidebar();
    return h("button", { onClick: () => setOpenMobile(true) }, "Open drawer");
  }
  ui.render(h(sidebar.SidebarProvider, null, h(OpenDrawer), h(sidebar.Sidebar, { id: "mobile-navigation", "aria-label": "Session navigation" }, "Sessions")));
  await userEvent.setup().click(ui.screen.getByRole("button", { name: "Open drawer" }));
  const content = ui.screen.getByRole("dialog");
  assert.equal(content.id, "mobile-navigation");
  assert.equal(content.getAttribute("aria-label"), "Session navigation");
});
