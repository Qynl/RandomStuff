// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeCanvasPrototype, installFrameController, installResizeObserver, type FrameController } from "./helpers/fake-dom";

/**
 * The browser entry point is small but it is the one file that can take the
 * whole page down before React exists: it assumes a `#root` element and mounts
 * the app into it. This runs the module against a prepared document with the
 * same canvas and animation-frame stand-ins the other shell tests use.
 */
describe("browser entry point", () => {
  let canvasProto: ReturnType<typeof installFakeCanvasPrototype>;
  let frames: FrameController;
  let restoreResizeObserver: () => void;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    canvasProto = installFakeCanvasPrototype();
    frames = installFrameController();
    restoreResizeObserver = installResizeObserver();
  });

  afterEach(() => {
    frames.restore();
    restoreResizeObserver();
    canvasProto.restore();
  });

  it("mounts the app into #root", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root");
    expect(root).toBeTruthy();

    await import("../src/main");
    // React 19 commits its initial render on a scheduled task, so let the queue
    // drain before inspecting the tree. Interactive behaviour (starting runs,
    // drawing frames) is covered with React's act() in app.test.tsx.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root?.childElementCount).toBeGreaterThan(0);
    expect(root?.textContent).toContain("LAST BRAIN");
    expect(root?.querySelector("canvas#game")).toBeTruthy();
    expect(root?.querySelector("#overlay")).toBeTruthy();
    // The entry point must not log anything on the way up.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

});
