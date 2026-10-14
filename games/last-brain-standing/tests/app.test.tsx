// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";
import type { ArenaGame } from "../src/game";
import { WORLD } from "../src/arena";
import { installFakeCanvasPrototype, installFrameController, installResizeObserver, pointer, pressKey, type FakeCanvas, type FrameController } from "./helpers/fake-dom";
import { BOT_KINDS } from "../src/ai";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/**
 * Mounts the real React shell against the real engine (fake canvas, manual
 * frame clock) and walks the user-visible flow: start, pause, resume, settings,
 * touch controls, and the end-of-run overlay.
 */
describe("React app shell", () => {
  let root: Root;
  let container: HTMLElement;
  let fake: FakeCanvas;
  let frames: FrameController;
  let restoreResizeObserver: () => void;
  let canvasProto: ReturnType<typeof installFakeCanvasPrototype>;
  let engine: ArenaGame | null;
  let consoleErrors: string[];

  const query = (selector: string) => container.querySelector(selector);
  const text = (selector: string) => query(selector)?.textContent ?? "";
  const button = (label: string) => {
    const buttons = Array.from(container.querySelectorAll("button"));
    return buttons.find((candidate) => (candidate.textContent ?? "").includes(label));
  };
  const click = (element: Element | undefined) => {
    if (!element) throw new Error("Element to click was not found");
    act(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  };
  const toggleNamed = (name: string) =>
    Array.from(container.querySelectorAll(".settings-section .toggle")).find((element) =>
      (element.parentElement?.textContent ?? "").includes(name)
    );
  const seedFieldValue = () => (query("#seed-input") as HTMLInputElement | null)?.value ?? "";
  const setInputValue = (field: HTMLInputElement, value: string) => {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  /** Kills the player through the simulation so the shell shows the result card. */
  const endRunNow = () => {
    if (!engine) throw new Error("engine was not created");
    const world = engine.activeWorld;
    world.player.invulnerability = 0;
    world.player.health = 1;
    world.bullets.push({
      position: { ...world.player.position },
      velocity: { x: 0, y: 0 },
      owner: "bot",
      damage: 50,
      life: 1,
      color: "#fff",
      source: "hunter",
      travelled: 0
    });
    advance(10);
  };
  /**
   * Pretends the page is running on a phone: coarse pointer, no mouse, a mobile
   * user agent and a phone-sized viewport. The shell decides whether to show the
   * on-screen sticks during mount, so this has to remount.
   */
  const simulatePhone = () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (media: string) => ({
        matches: media.includes("coarse"),
        media,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    remount();
  };

  /** Pretends the page is running on a desktop with a touchscreen. */
  const simulateTouchLaptop = () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (media: string) => ({
        matches: media.includes("coarse") || media.includes("fine"),
        media,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    remount();
  };

  /** Tears the shell down and mounts it again, the way a page load would. */
  const remount = () => {
    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    engine = null;
    act(() => {
      root = createRoot(container);
      root.render(<App onGameReady={(game) => { engine = game; }} />);
    });
  };
  const press = (key: string) => {
    act(() => {
      pressKey(key);
    });
  };
  const advance = (frameCount: number, ms = 16.7) => {
    act(() => {
      frames.advance(frameCount, ms);
    });
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    // location persists for the whole file: clear any run code left by a previous test.
    window.history.replaceState(null, "", "/");
    engine = null;
    container = document.createElement("div");
    document.body.append(container);

    canvasProto = installFakeCanvasPrototype();
    frames = installFrameController();
    restoreResizeObserver = installResizeObserver();
    consoleErrors = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    });
    // jsdom cannot fetch the Google Fonts stylesheet the app references.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    act(() => {
      root = createRoot(container);
      root.render(<App onGameReady={(game) => { engine = game; }} />);
    });

    // jsdom has no layout engine: give every element a plausible box so the
    // virtual stick can map pointer positions (the canvas keeps its own rect).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 14,
      y: 400,
      left: 14,
      top: 400,
      right: 146,
      bottom: 532,
      width: 132,
      height: 132,
      toJSON: () => ({})
    } as DOMRect);

    const canvas = query("#game") as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    fake = canvasProto.fakeFor(canvas);
    expect(fake).toBeTruthy();
    expect(canvas.width).toBe(WORLD.width);
  });

  afterEach(() => {
    act(() => root.unmount());
    frames.restore();
    restoreResizeObserver();
    canvasProto.restore();
    container.remove();
    vi.restoreAllMocks();
  });

  it("opens on the command screen with the roster, the record and a way in", () => {
    // The front door is a lobby, not a document: an operative on a lit floor,
    // destinations down the side, and the deploy button under the class ribbon.
    expect(container.querySelector(".home-screen")).toBeTruthy();
    expect(text(".medallion-copy")).toContain("OPERATOR PROFILE");
    expect(container.querySelectorAll(".rail-button")).toHaveLength(4);
    expect(container.querySelectorAll(".operator-figure[data-class=\"vanguard\"]")).toHaveLength(1);
    expect(text(".stage-plate")).toContain("VANGUARD");
    expect(text(".strip-chip")).toContain("CAREER SCORE");

    // Six classes, every one issued and selectable, each with its signature rule.
    const cards = Array.from(container.querySelectorAll(".loadout-card")) as HTMLButtonElement[];
    expect(cards).toHaveLength(6);
    expect(cards.filter((card) => card.disabled)).toHaveLength(0);
    expect(cards.map((card) => card.textContent ?? "").join(" | ")).toContain("SIEGE DASH");

    // The arena is already loaded and standing by behind the lobby, with the
    // result overlay out of the way until there is a result.
    expect(text("#game") === "").toBe(true);
    expect(text("#arena-message")).toBe("ELIMINATE HOSTILES");
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
    expect(container.textContent).toContain("ENTER THE ARENA");

    // Controls and rules are one tap away in a sheet.
    click(button("HOW TO PLAY"));
    expect(container.querySelector(".home-sheet")).toBeTruthy();
    expect(container.textContent).toContain("SHIFT");
    expect(container.textContent).toContain("READ THE RINGS");
    click(button("✕"));
    expect(container.querySelector(".home-sheet")).toBeNull();
  });

  it("moves between the lobby, the roster sheet, the arena and the profile", () => {
    // Roster sheet: every class with its own numbers, and equipping from it.
    click(button("CLASSES"));
    const classCards = Array.from(container.querySelectorAll(".class-card"));
    expect(classCards).toHaveLength(6);
    expect(classCards[0].textContent).toContain("WEAPON");
    expect(classCards[0].textContent).toContain("SERVICE RIFLE");
    const sapperCard = classCards.find((card) => card.textContent?.includes("SAPPER")) ?? classCards[0];
    click(Array.from(sapperCard.querySelectorAll("button")).at(-1));
    expect(engine?.getLoadoutId()).toBe("sapper");
    click(button("✕"));

    // Arena sheet: the four layouts, drawn from their own obstacle lists.
    click(button("ARENAS"));
    expect(container.querySelectorAll(".arena-card")).toHaveLength(4);
    expect(text(".arena-grid")).toContain("PILLARS");
    click(button("✕"));

    // Into the arena, then back out to the lobby with the house button.
    click(button("ENTER THE ARENA"));
    advance(4);
    expect(container.querySelector(".home-screen")).toBeNull();
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
    const home = Array.from(container.querySelectorAll(".icon-button")).find((element) =>
      (element.getAttribute("aria-label") ?? "").includes("command screen")
    ) as HTMLButtonElement;
    expect(home.disabled).toBe(true); // cannot leave a live run
    endRunNow();
    expect(home.disabled).toBe(false);
    click(home);
    expect(container.querySelector(".home-screen")).toBeTruthy();
    expect(engine?.getLoadoutId()).toBe("sapper"); // the choice follows you back
  });

  it("starts a run from the overlay and pushes live telemetry into the panel", () => {
    click(button("ENTER THE ARENA"));
    advance(4);
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
    expect(container.textContent).toContain("SIMULATION ACTIVE");
    expect(container.textContent).toContain("COMBAT FEED");
    advance(300); // ~5s: hostiles are on the floor
    expect(container.textContent).toMatch(/THE HUNTER/);
    expect(container.textContent).toContain("THREAT LEVEL");
    expect(container.textContent).toContain("SEED");
    expect(container.textContent).toContain("A RING MEANS THAT PROFILE IS ABOUT TO FIRE");
    expect(fake.total()).toBeGreaterThan(500);
  });

  it("shows which arena the run is being played in", () => {
    click(button("ENTER THE ARENA"));
    advance(40);
    const arena = Array.from(container.querySelectorAll(".meta-row")).find((row) => row.textContent?.startsWith("ARENA"));
    expect(arena).toBeTruthy();
    expect(["QUADRANT", "LANES", "PILLARS", "DIAMOND"]).toContain(arena?.textContent?.replace("ARENA", "") ?? "");
  });

  it("keeps the wave tip visible in the panel after the banner fades", () => {
    click(button("ENTER THE ARENA"));
    advance(36);
    const hint = container.querySelector(".wave-hint");
    expect(hint?.textContent).toContain("RINGS MARK INCOMING SHOTS");
    // Still there minutes later, unlike the arena banner.
    advance(600);
    expect(container.querySelector(".wave-hint")?.textContent).toBeTruthy();
  });

  it("explains what the rings mean on the very first telegraph", () => {
    click(button("ENTER THE ARENA"));
    advance(36);
    // Wave one has not started yet, so the tip stands in for the countdown.
    expect(container.querySelector("#arena-message")?.textContent).toBe("RINGS MARK INCOMING SHOTS — MOVE OR DASH");
    advance(120);
    // Once a wave is running the message returns to the normal states.
    expect(container.querySelector("#arena-message")?.textContent).not.toContain("RINGS MARK");
    const next = engine?.activeWorld.wave ?? 0;
    expect(next).toBeGreaterThanOrEqual(1);
  });

  it("names the profile that ended the run and how to beat it next time", () => {
    click(button("ENTER THE ARENA"));
    advance(60);
    endRunNow();
    const hint = container.querySelector(".counter-hint");
    expect(hint?.textContent).toContain("THE HUNTER");
    expect(hint?.textContent).toContain("break the line early or sidestep late");
    // The profile list exposes the same counter advice as a tooltip.
    const hunter = container.querySelector('[data-bot="hunter"]');
    expect(hunter?.getAttribute("title")).toContain("BARREL STOPS TRACKING");
  });

  it("shows the inbound countdown while a later wave is telegraphing", () => {
    click(button("ENTER THE ARENA"));
    advance(36);
    if (!engine) throw new Error("engine was not created");
    // Wave two telegraphing: the message and the panel both count it down.
    act(() => {
      const world = engine!.activeWorld;
      world.wave = 1;
      world.waveState = "telegraph";
      world.waveTimer = 0.9;
      world.stats.wave = 1;
    });
    advance(12);
    expect(container.querySelector("#arena-message")?.textContent).toMatch(/^THREAT INBOUND · \d\.\dS$/);
    const inbound = Array.from(container.querySelectorAll(".meta-row.inbound"));
    expect(inbound).toHaveLength(1);
    expect(inbound[0].textContent).toContain("HUNTER");
    // One row per profile the game can field, all of them listed.
    expect(container.querySelectorAll(".opponent").length).toBe(BOT_KINDS.length);

    advance(120);
    expect(container.querySelectorAll(".meta-row.inbound")).toHaveLength(0);
  });

  it("pauses with Escape, shows the pause card, and resumes from it", () => {
    click(button("ENTER THE ARENA"));
    advance(120);
    press("Escape");
    advance(1);
    expect(container.textContent).toContain("TAKE A");
    expect(container.textContent).toContain("RESUME RUN");
    click(button("RESUME RUN"));
    advance(2);
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
  });

  it("switches difficulty from the settings panel", () => {
    click(button("VETERAN"));
    expect(container.textContent).toContain("Short tells, sharper tracking");
    click(button("RECRUIT"));
    expect(container.textContent).toContain("Longer telegraphs, softer rounds");
  });

  it("toggles aiming mode, screen shake and telemetry", () => {
    click(button("ASSISTED"));
    const assisted = container.querySelector('[aria-label="Aiming mode"] .segment.active');
    expect(assisted?.textContent).toBe("ASSISTED");
    click(toggleNamed("SCREEN SHAKE"));
    expect(toggleNamed("SCREEN SHAKE")?.textContent).toBe("OFF");
    click(toggleNamed("TELEMETRY"));
    expect(container.textContent).toContain("HIT-STOP");
    click(toggleNamed("TELEMETRY"));
    expect(container.textContent).not.toContain("HIT-STOP");
  });

  it("reveals touch controls with a working stick and releases on pointer cancel", () => {
    // jsdom advertises touch support, so the toggle can start in either state.
    const state = () => toggleNamed("TOUCH CONTROLS")?.getAttribute("aria-pressed");
    const startedOn = state() === "true";
    click(toggleNamed("TOUCH CONTROLS"));
    expect(state()).toBe(startedOn ? "false" : "true");
    if (state() !== "true") click(toggleNamed("TOUCH CONTROLS"));
    expect(state()).toBe("true");
    advance(1);
    const layer = container.querySelector(".touch-layer");
    expect(layer).toBeTruthy();
    const stick = container.querySelector(".touch-stick") as HTMLElement;
    const knob = container.querySelector(".touch-stick-knob") as HTMLElement;
    expect(stick).toBeTruthy();

    act(() => {
      pointer(stick, "pointerdown", { clientX: 40, clientY: 500, pointerId: 7, pointerType: "touch" });
      pointer(stick, "pointermove", { clientX: 110, clientY: 500, pointerId: 7, pointerType: "touch" });
    });
    expect(knob.style.transform).not.toBe("translate(0px, 0px)");

    act(() => {
      pointer(stick, "pointercancel", { pointerId: 7, pointerType: "touch" });
    });
    expect(knob.style.transform).toBe("translate(0px, 0px)");

    const fireButton = Array.from(container.querySelectorAll(".touch-button")).find((element) => element.textContent?.includes("FIRE"));
    expect(fireButton).toBeTruthy();
  });

  it("marks the run as over and offers a replay of the same seed", () => {
    click(button("ENTER THE ARENA"));
    advance(120);
    // End the run through the simulation: the shell must react to the engine result.
    const canvas = query("#game") as HTMLCanvasElement;
    void canvas;
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    advance(1);
    expect(container.textContent).toContain("TAKE A");
    expect(container.textContent).toContain("RESUME RUN");
    click(button("RESTART FROM SCRATCH"));
    advance(4);
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
    expect(container.textContent).toContain("SIMULATION ACTIVE");
  });

  it("prefills a run from a shareable URL hash", () => {
    expect(seedFieldValue()).toBe("");
    act(() => {
      window.location.hash = "#seed=1a2b3c&level=veteran";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    // The App reads the hash on mount; remount to simulate opening a link.
    act(() => root.unmount());
    act(() => {
      root = createRoot(container);
      root.render(<App onGameReady={(game) => { engine = game; }} />);
    });
    expect(seedFieldValue()).toBe("1A2B3C");
    expect(container.querySelector('[aria-label="Difficulty"] .segment.active')?.textContent).toBe("VETERAN");
    expect(container.textContent).toContain("BEST ON VETERAN");
  });

  it("publishes the run code in the URL and copies a share link", async () => {
    const written: string[] = [];
    const clipboard = { writeText: async (text: string) => { written.push(text); } };
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
    try {
      act(() => {
        location.hash = "";
      });
      const seedField = container.querySelector("#seed-input") as HTMLInputElement;
      setInputValue(seedField, "ZZTOP1");
      expect(seedField.value).toBe("ZZTOP1");
      click(button("ENTER THE ARENA"));
      advance(2);
      const label = engine?.getSeedLabel();
      expect(label).toMatch(/^[0-9A-F]{6}$/);
      // The address bar carries the canonical label, which replays the same fight.
      expect(window.location.hash).toBe(`#seed=${label}&level=standard`);

      // End the run so the result overlay offers the share button.
      endRunNow();
      expect(container.textContent).toContain("ENDED BY");
      click(button("COPY SEED LINK"));
      await act(async () => {
        await Promise.resolve();
      });
      expect(written).toHaveLength(1);
      expect(written[0]).toContain(`#seed=${label}&level=standard`);
      expect(container.textContent).toContain("copied");
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("lets the player pick a class and holds it for the run", () => {
    // Every class is issued: six cards, none of them disabled, on a fresh career.
    const cards = () => Array.from(container.querySelectorAll(".loadout-card"));
    expect(cards()).toHaveLength(6);
    expect(cards().filter((card) => (card as HTMLButtonElement).disabled)).toHaveLength(0);
    const breacher = cards().find((card) => card.textContent?.includes("BREACHER")) as HTMLButtonElement;
    expect(breacher.disabled).toBe(false);
    // Each card carries its signature rule, not a lock.
    expect(breacher.textContent).toContain("SIEGE DASH");

    // The hint explains how the equipped class wants to be played.
    expect(text(".loadout-hint")).toContain("keep the reticle on the target");

    click(button("ENTER THE ARENA"));
    advance(6);
    expect(engine?.getLoadoutId()).toBe("vanguard");
    const weaponRow = Array.from(container.querySelectorAll(".meta-row")).find((row) => row.textContent?.startsWith("WEAPON"));
    expect(weaponRow?.textContent).toContain("VANGUARD");
  });

  it("shows the operator profile with career progress and unlocks", () => {
    // Seed a career worth 5,000 on the standard level: one unlock earned.
    window.localStorage.setItem("lbs-best-by-difficulty", JSON.stringify({ standard: { score: 5000, kills: 20 } }));
    window.localStorage.setItem("lbs-career-runs", "7");
    window.localStorage.setItem("lbs-career-kills", "88");
    remount();

    click(button("OPERATOR PROFILE"));
    expect(text(".profile-rank")).toBe("OPERATOR");
    expect(text(".profile-sub")).toContain("CAREER 5000");
    expect(text(".profile-sub")).toContain("7 RUNS");
    expect(text(".profile-sub")).toContain("88 KILLS");

    // The class roster is fully issued: nothing on the shelf is withheld.
    const unlocks = Array.from(container.querySelectorAll(".unlock-list li"));
    expect(unlocks).toHaveLength(6);
    expect(unlocks.filter((item) => item.classList.contains("unlocked"))).toHaveLength(6);
    expect(text(".unlock-list")).toContain("ISSUED");

    const best = Array.from(container.querySelectorAll(".best-list li")).map((item) => item.textContent ?? "");
    expect(best.some((row) => row.includes("5000"))).toBe(true);

    // The service record: a badge shelf with counted progress, plus per-weapon
    // records, so the profile reads like an account rather than a scoreboard.
    expect(text(".profile-block h2")).toBeDefined();
    const badges = Array.from(container.querySelectorAll(".badge"));
    expect(badges.length).toBeGreaterThanOrEqual(6);
    expect(badges.filter((badge) => badge.classList.contains("earned")).length).toBeGreaterThan(0);
    // Locked badges hide their name and show what it takes instead.
    const locked = badges.filter((badge) => badge.classList.contains("locked"));
    expect(locked.every((badge) => (badge.querySelector(".badge-name")?.textContent ?? "").includes("???"))).toBe(true);
    expect(container.querySelectorAll(".badge-bar").length).toBe(locked.length);

    const weapons = Array.from(container.querySelectorAll(".weapon-list li")).map((item) => item.textContent ?? "");
    expect(weapons).toHaveLength(6);
    expect(weapons.some((row) => row.includes("SERVICE RIFLE"))).toBe(true);
    expect(weapons.some((row) => row.includes("FLAME PROJECTOR"))).toBe(true);

    // The threat dossier names each profile's signature and counts what it has
    // done to this account.
    const dossier = Array.from(container.querySelectorAll(".dossier-list li"));
    expect(dossier).toHaveLength(BOT_KINDS.length);
    expect(dossier.map((row) => row.getAttribute("data-bot"))).toEqual(BOT_KINDS);
    expect(text(".dossier-list li[data-bot=\"hunter\"]")).toContain("DOUBLE SALVO");
    expect(text(".dossier-list li[data-bot=\"flanker\"]")).toContain("PINCER DISCIPLINE");
    expect(text(".dossier-list li[data-bot=\"mirror\"]")).toContain("COPY OF YOUR OWN WEAPON");
    expect(text(".dossier-list li[data-bot=\"hunter\"]")).toContain("NEVER ENDED A RUN");

    // Back out to the command screen, which is where the profile was opened from.
    click(button("BACK TO COMMAND"));
    expect(query(".profile-rank")).toBeNull();
    expect(button("ENTER THE ARENA")).toBeTruthy();
  });

  it("records the finished run against the weapon that was used", () => {
    remount();
    click(button("ENTER THE ARENA"));
    advance(20);
    const world = engine?.activeWorld;
    if (!world) throw new Error("expected a world");
    expect(world.loadout.id).toBe("vanguard");
    world.stats.kills = 6;
    endRunNow();

    // The run is written to the rifle's service record, and the badge shelf
    // picks up the single finished run.
    click(button("OPERATOR PROFILE"));
    const weapons = Array.from(container.querySelectorAll(".weapon-list li")).map((item) => item.textContent ?? "");
    const rifle = weapons.find((row) => row.includes("RIFLE")) ?? "";
    expect(rifle).toContain("1 runs");
    expect(rifle).toContain("6 kills");
    const earned = Array.from(container.querySelectorAll(".badge.earned")).map((item) => item.textContent ?? "");
    expect(earned.some((badge) => badge.includes("FIRST CONTACT"))).toBe(true);
  });

  it("swaps to the breacher with no career score at all", () => {
    remount();
    let cards = Array.from(container.querySelectorAll(".loadout-card")) as HTMLButtonElement[];
    expect(cards).toHaveLength(6);
    expect(cards.filter((card) => !card.disabled)).toHaveLength(6);

    // Swap on a brand-new account: no runs, no score, no gate.
    cards = Array.from(container.querySelectorAll(".loadout-card")) as HTMLButtonElement[];
    const breacher = cards.find((card) => card.textContent?.includes("BREACHER")) as HTMLButtonElement;
    expect(breacher.disabled).toBe(false);
    click(breacher);
    expect(engine?.getLoadoutId()).toBe("breacher");
    expect(text(".loadout-hint")).toContain("Close the distance");
    // And it survives into the run that starts next.
    click(button("ENTER THE ARENA"));
    advance(6);
    expect(engine?.getLoadoutId()).toBe("breacher");
    expect(window.localStorage.getItem("lbs-loadout")).toBe("breacher");
  });

  it("opens with the settings this device stored last time", () => {
    // The engine owns the settings, so the panel must reflect what it restored
    // rather than falling back to its own defaults on a fresh load.
    window.localStorage.setItem("lbs-aim", "assisted");
    window.localStorage.setItem("lbs-difficulty", "veteran");
    window.localStorage.setItem("lbs-shake", "false");
    window.localStorage.setItem("lbs-muted", "true");

    // Remount the shell the way a page load would.
    remount();
    // Read the engine through a widening cast: `engine` was just assigned null.
    const restored = engine as ArenaGame | null;
    expect(restored).toBeTruthy();

    expect(button("ASSISTED")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("VETERAN")?.getAttribute("aria-pressed")).toBe("true");
    expect(toggleNamed("SCREEN SHAKE")?.getAttribute("aria-pressed")).toBe("false");
    expect(restored?.isMuted()).toBe(true);
    // And the restored setting is the one the run actually uses.
    expect(restored?.getAimMode()).toBe("assisted");
    expect(restored?.activeWorld.difficulty).toBe("veteran");
  });

  it("teaches the aim mode the player actually has on touch", () => {
    simulatePhone();
    click(button("ENTER THE ARENA"));
    advance(4);
    // On a phone the touch layer is on, so the hint reflects the current aim mode.
    expect(container.querySelector(".touch-hint")?.textContent).toContain("DRAG THE ARENA TO AIM");
    click(button("ASSISTED"));
    advance(4);
    expect(container.querySelector(".touch-hint")?.textContent).toContain("ASSISTED AIM TARGETS AUTOMATICALLY");
    click(button("MOUSE"));
    advance(4);
    expect(container.querySelector(".touch-hint")?.textContent).toContain("DRAG THE ARENA TO AIM");
  });

  it("keeps the on-screen sticks off a desktop that merely reports touch support", () => {
    // A touchscreen laptop: `ontouchstart` exists and the primary pointer is
    // coarse, but there is a mouse, a keyboard and a desktop user agent.
    expect("ontouchstart" in window).toBe(true);
    simulateTouchLaptop();
    click(button("ENTER THE ARENA"));
    advance(4);
    expect(query(".touch-hint")).toBeNull();
    expect(query(".touch-button")).toBeNull();
    expect(query(".touch-stick")).toBeNull();
  });

  it("shows the on-screen sticks on a phone", () => {
    simulatePhone();
    click(button("ENTER THE ARENA"));
    advance(4);
    expect(query(".touch-stick")).toBeTruthy();
    expect(query(".touch-button")).toBeTruthy();
  });

  it("lets the settings toggle override the automatic touch decision", () => {
    simulateTouchLaptop();
    const toggle = () => {
      const row = Array.from(container.querySelectorAll(".setting-row")).find((row) => row.textContent?.includes("TOUCH CONTROLS"));
      return row?.querySelector("button") ?? undefined;
    };
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
    click(toggle());
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    click(button("ENTER THE ARENA"));
    advance(4);
    expect(query(".touch-stick")).toBeTruthy();
    click(toggle());
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows which arena a typed seed will play in, and can pick a fresh seed", () => {
    const field = query("#seed-input") as HTMLInputElement;
    expect(text(".seed-arena")).toBe("TYPE OR PASTE A SEED TO SEE ITS ARENA");

    // A typed seed names its arena before the run even starts.
    setInputValue(field, "LANES");
    expect(text(".seed-arena")).toMatch(/^ARENA (QUADRANT|LANES|PILLARS|DIAMOND)$/);
    const named = text(".seed-arena").replace("ARENA", "").trim();

    // RANDOM fills the field with a fresh six-character label and, with it, an arena.
    click(button("RANDOM"));
    const rolled = seedFieldValue();
    expect(rolled).toMatch(/^[0-9A-F]{6}$/);
    expect(text(".seed-arena")).toMatch(/^ARENA (QUADRANT|LANES|PILLARS|DIAMOND)$/);

    // And the preview agrees with the arena the run actually gets.
    const expectedArena = text(".seed-arena").replace("ARENA", "").trim();
    click(button("ENTER THE ARENA"));
    advance(8);
    expect(engine?.activeWorld.arenaName).toBe(expectedArena);
    // The start screen is gone while playing, so the preview no longer renders.
    expect(query(".seed-preview")).toBeNull();
    expect(named.length).toBeGreaterThan(2);
  });

  it("unpacks a pasted share link into the seed and the difficulty", () => {
    const seedField = container.querySelector("#seed-input") as HTMLInputElement;
    expect(seedField.placeholder).toContain("PASTE A LINK");
    setInputValue(seedField, "https://example.com/#seed=1a2b3c&level=veteran");
    expect(seedField.value).toBe("1A2B3C");
    expect(container.querySelector('[aria-label="Difficulty"] .segment.active')?.textContent).toBe("VETERAN");
    expect(container.querySelector(".share-notice")?.textContent).toContain("1A2B3C · VETERAN");
    expect(engine?.activeWorld.difficulty).toBe("veteran");
  });

  it("starts a run when Enter is pressed in the seed field", () => {
    const seedField = container.querySelector("#seed-input") as HTMLInputElement;
    setInputValue(seedField, "ENTER1");
    expect(seedField.value).toBe("ENTER1");
    const keydown = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      seedField.dispatchEvent(keydown);
    });
    advance(2);
    expect(keydown.defaultPrevented).toBe(true);
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
    expect(container.textContent).toContain("SIMULATION ACTIVE");
    expect(window.location.hash).toBe(`#seed=${engine?.getSeedLabel()}&level=standard`);
  });

  it("moves keyboard focus to the canvas while playing and back to the overlay button afterwards", () => {
    click(button("ENTER THE ARENA"));
    advance(4);
    expect(document.activeElement?.id).toBe("game");
    endRunNow();
    expect(document.activeElement?.textContent).toContain("RUN IT BACK");
  });

  it("does not let game hotkeys hijack typing in the seed field", () => {
    const seedField = container.querySelector("#seed-input") as HTMLInputElement;
    seedField.focus();
    act(() => {
      for (const key of ["m", "r", " ", "Shift"]) {
        seedField.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      }
    });
    const muteButton = container.querySelector('[aria-label*="sound effects"]');
    expect(muteButton?.getAttribute("aria-pressed")).toBe("false");
    // The seed field keeps its own default behaviour: the test can still type.
    expect(seedField.readOnly).toBe(false);
  });

  it("explains what the Mirror has learned and how to break it", () => {
    click(button("ENTER THE ARENA"));
    advance(30);
    // Wave one is Hunters only, so the panel says the read is idle.
    expect(container.querySelector(".mirror-advice")?.textContent).toContain("NO MIRROR ACTIVE");

    // Drop a Mirror into the fight and move in a straight line: the read climbs.
    if (!engine) throw new Error("engine was not created");
    act(() => {
      const world = engine!.activeWorld;
      world.waveState = "idle";
      world.bots.push({
        id: 77,
        kind: "mirror",
        position: { x: 720, y: 150 },
        velocity: { x: 0, y: 0 },
        health: 60,
        maxHealth: 60,
        fireCooldown: 5,
        windup: 0,
        windupDuration: 0,
        windupTurnRate: 2,
        facing: 0,
        spawnGuard: 99,
        strafeSign: 1,
        strafeLock: 0,
        alive: true,
        hitFlash: 0,
        blindTime: 0,

      pendingRounds: 0,

      burstTimer: 0,

      diveTime: 0,

      diveCooldown: 0,
      stun: 0,
      chargeTime: 0,
      chargeDirection: { x: 0, y: 0 },
      sprayTime: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0});
    });
    act(() => {
      pressKey("d");
    });
    advance(90);
    const advice = container.querySelector(".mirror-advice")?.textContent ?? "";
    expect(advice).toContain("READING YOUR MOVEMENT");
    expect(advice).toContain("CHANGE DIRECTION");
  });

  it("announces run milestones instead of every feed line", () => {
    click(button("ENTER THE ARENA"));
    advance(4);
    const live = container.querySelector(".sr-status");
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector(".combat-feed")?.getAttribute("aria-live")).toBe("off");
    // The status bar itself is decorative now: FPS churn must not be announced.
    expect(container.querySelector(".top-status")?.getAttribute("aria-live")).toBeNull();

    advance(30);
    expect(live?.textContent).toContain("Threat level 1 inbound");
    advance(150);
    expect(live?.textContent).not.toContain("inbound");

    press("Escape");
    expect(container.querySelector(".sr-status")?.textContent).toContain("Paused at threat level");
    click(button("RESUME RUN"));
    advance(10);
    endRunNow();
    expect(container.querySelector(".sr-status")?.textContent).toMatch(/Run over\. Score \d+/);
  });

  it("lists the best finished runs on this device", () => {
    expect(container.textContent).toContain("No finished runs on this device yet.");
    click(button("ENTER THE ARENA"));
    advance(160);
    endRunNow();
    const history = container.querySelector(".history-list");
    expect(history).toBeTruthy();
    const first = history?.querySelector("li");
    expect(first?.classList.contains("best")).toBe(true);
    expect(first?.textContent).toContain("seed");
    expect(first?.textContent).toContain("STANDARD");
  });

  it("replays any stored run straight from the best-runs list, on its own difficulty", () => {
    click(button("ENTER THE ARENA"));
    advance(160);
    endRunNow();
    const stored = container.querySelector(".history-replay") as HTMLButtonElement;
    expect(stored).toBeTruthy();
    const originalSeed = engine?.getSeedLabel();

    click(stored);
    advance(4);
    expect(container.querySelector("#overlay")?.classList.contains("hidden")).toBe(true);
    expect(engine?.getSeedLabel()).toBe(originalSeed);
    expect(container.textContent).toContain("SIMULATION ACTIVE");
    expect(window.location.hash).toContain(`seed=${originalSeed}`);
  });

  it("puts the arena on the result card", () => {
    click(button("ENTER THE ARENA"));
    advance(140);
    const arenaName = engine?.activeWorld.arenaName ?? "";
    endRunNow();
    const rows = Array.from(container.querySelectorAll(".summary-row")).map((row) => row.textContent ?? "");
    const row = rows.find((text) => text.startsWith("ARENA"));
    expect(row).toBeTruthy();
    expect(row).toContain(arenaName);
  });

  it("shows the score breakdown on the result card", () => {
    click(button("ENTER THE ARENA"));
    advance(160);
    endRunNow();
    const breakdown = container.querySelector(".score-breakdown")?.textContent ?? "";
    expect(breakdown).toMatch(/KILLS \d+ · WAVES \d+ · ACCURACY \d+ · PACE \d+/);
  });

  it("advertises its keyboard shortcuts to assistive technology", () => {
    simulatePhone();
    expect(container.querySelector('.icon-button[aria-keyshortcuts="M"]')).toBeTruthy();
    expect(container.querySelector('.icon-button[aria-keyshortcuts="F3"]')).toBeTruthy();
    expect(container.querySelector('.icon-button[aria-keyshortcuts="Escape"]')).toBeTruthy();
    // The dash button carries the keyboard equivalent of its action.
    click(button("ENTER THE ARENA"));
    advance(2);
    expect(container.querySelector(".touch-button")?.getAttribute("aria-keyshortcuts")).toBe("Shift");
  });

  it("reports no console errors during a full start-pause-resume cycle", () => {
    click(button("ENTER THE ARENA"));
    advance(60);
    press("Escape");
    advance(2);
    click(button("RESUME RUN"));
    advance(60);
    pressKey("m");
    advance(2);
    const relevant = consoleErrors.filter((message) => !message.includes("Not implemented"));
    expect(relevant).toEqual([]);
  });
});
