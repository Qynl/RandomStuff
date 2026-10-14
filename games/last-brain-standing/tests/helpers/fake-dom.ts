/**
 * Browser stand-ins for jsdom tests.
 *
 * jsdom has no canvas and no requestAnimationFrame clock we can steer, so the
 * renderer gets a recording fake 2D context and the game loop gets a frame
 * queue we advance by hand. That lets the real ArenaGame loop, input handling,
 * effect pipeline and React lifecycle run under test without a browser.
 */

export interface RecordedCanvasCalls {
  [name: string]: number;
}

export interface FakeCanvas {
  context: CanvasRenderingContext2D;
  calls: RecordedCanvasCalls;
  /** Every string passed to fillText/strokeText, in draw order. */
  texts: string[];
  /** Total 2D calls recorded, useful for "did it actually draw" assertions. */
  total(): number;
  reset(): void;
}

/** Builds a CanvasRenderingContext2D-shaped object that records every call. */
export function createFakeCanvasContext(calls: RecordedCanvasCalls = {}, texts: string[] = []): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string, unknown> = {
    canvas: null,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setLineDash: () => undefined,
    getLineDash: () => []
  };

  return new Proxy(target, {
    get(object, property: string) {
      if (property in object) {
        const value = object[property];
        if (typeof value === "function") {
          return (...args: unknown[]) => {
            calls[property] = (calls[property] ?? 0) + 1;
            return (value as (...inner: unknown[]) => unknown)(...args);
          };
        }
        return value;
      }
      calls[property] = (calls[property] ?? 0) + 1;
      if (property === "fillText" || property === "strokeText") {
        return (value: unknown) => {
          texts.push(String(value));
        };
      }
      return () => undefined;
    },
    set(object, property: string, value: unknown) {
      object[property] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
}

/** Installs a fake 2D context on the given canvas and returns the recorder. */
export function installFakeCanvasContext(canvas: HTMLCanvasElement): FakeCanvas {
  const calls: RecordedCanvasCalls = {};
  const texts: string[] = [];
  const context = createFakeCanvasContext(calls, texts);
  (context as unknown as { canvas: HTMLCanvasElement }).canvas = canvas;
  canvas.getContext = ((type: string) => (type === "2d" ? context : null)) as HTMLCanvasElement["getContext"];
  // jsdom reports a zero-sized rect; the arena maps pointer input through it.
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: 960, bottom: 600, width: 960, height: 600, toJSON: () => ({}) }) as DOMRect;
  return {
    context,
    calls,
    texts,
    total: () => Object.values(calls).reduce((sum, value) => sum + value, 0),
    reset: () => {
      for (const key of Object.keys(calls)) delete calls[key];
      texts.length = 0;
    }
  };
}

/**
 * Patches the canvas prototype so every canvas created afterwards - including
 * the engine's offscreen background cache - gets a recording fake context.
 */
export function installFakeCanvasPrototype(): { fakeFor: (canvas: HTMLCanvasElement) => FakeCanvas; restore: () => void } {
  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext;
  const fakes = new WeakMap<HTMLCanvasElement, FakeCanvas>();
  const fakeFor = (canvas: HTMLCanvasElement): FakeCanvas => {
    let fake = fakes.get(canvas);
    if (!fake) {
      fake = installFakeCanvasContext(canvas);
      fakes.set(canvas, fake);
    }
    return fake;
  };
  proto.getContext = function patched(this: HTMLCanvasElement, type: string) {
    if (type !== "2d") return null;
    return fakeFor(this).context;
  } as HTMLCanvasElement["getContext"];
  return {
    fakeFor,
    restore() {
      proto.getContext = original;
    }
  };
}

export interface FrameController {
  /** Runs the queued animation frame callbacks, advancing the clock by 16.7ms each. */
  advance(frames: number, msPerFrame?: number): void;
  /** Simulated wall clock in milliseconds. */
  now(): number;
  pending(): number;
  restore(): void;
}

/** Replaces requestAnimationFrame/cancelAnimationFrame with a manual clock. */
export function installFrameController(startTime = Math.ceil(performance.now())): FrameController {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let queue: Array<{ id: number; callback: FrameRequestCallback }> = [];
  let nextId = 1;
  let clock = startTime;

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    queue.push({ id, callback });
    return id;
  }) as typeof requestAnimationFrame;

  globalThis.cancelAnimationFrame = ((id: number) => {
    queue = queue.filter((entry) => entry.id !== id);
  }) as typeof cancelAnimationFrame;

  return {
    advance(frames: number, msPerFrame = 16.7) {
      for (let frame = 0; frame < frames; frame += 1) {
        // Keep the fake clock ahead of real time so the engine's first frame
        // sees a normal delta instead of a negative one.
        clock = Math.max(clock + msPerFrame, Math.ceil(performance.now()));
        const current = queue;
        queue = [];
        for (const entry of current) entry.callback(clock);
      }
    },
    now: () => clock,
    pending: () => queue.length,
    restore() {
      globalThis.requestAnimationFrame = originalRequest;
      globalThis.cancelAnimationFrame = originalCancel;
    }
  };
}

/** Minimal ResizeObserver so canvas resizing code can run under jsdom. */
export function installResizeObserver(): () => void {
  const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  class StubObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubObserver;
  return () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
  };
}

/** Dispatches a key event the way the engine's window listeners expect. */
export function pressKey(key: string, options: { type?: "keydown" | "keyup"; repeat?: boolean; shiftKey?: boolean } = {}): void {
  const event = new KeyboardEvent(options.type ?? "keydown", {
    key,
    bubbles: true,
    cancelable: true,
    repeat: options.repeat ?? false,
    shiftKey: options.shiftKey ?? false
  });
  window.dispatchEvent(event);
}

/** Dispatches a pointer event with the fields the engine reads. */
export function pointer(
  target: EventTarget,
  type: string,
  init: { clientX?: number; clientY?: number; pointerId?: number; button?: number; pointerType?: string } = {}
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(event, {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    pointerType: init.pointerType ?? "mouse",
    isPrimary: true
  });
  target.dispatchEvent(event);
}
