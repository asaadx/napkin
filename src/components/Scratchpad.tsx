"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "@excalidraw/excalidraw/index.css";
import "./Scratchpad.css";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTheme } from "@/components/theme/useTheme";
import { detectArrowhead, detectCylinder, recognizeShape } from "@/lib/shapes";
import {
  elementPointsToScene,
  findArrowheadTarget,
  linearEndpoints,
  linearSkeleton,
  shapeToSkeletons,
  type ArrowheadCandidate,
  type ShapeSkeleton,
} from "@/lib/scratchpad/convert";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[13px] text-fg-3">
        Loading canvas…
      </div>
    ),
  },
);

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");
type ExcalidrawProps = React.ComponentProps<typeof Excalidraw>;
type OnChange = NonNullable<ExcalidrawProps["onChange"]>;
type InitialData = ExcalidrawProps["initialData"];

const SAVE_DELAY_MS = 500;
/** A stroke drawn within this window after a line is converted may become its arrowhead. */
const ARROWHEAD_WINDOW_MS = 4000;
/** An unconverted stroke stays eligible to pair into a two-stroke cylinder for this long. */
const CYLINDER_WINDOW_MS = 5000;
/** How many recent unconverted strokes are tried as the other half of a cylinder. */
const CYLINDER_CANDIDATES = 3;
const SMART_SHAPES_KEY = "napkin:smartShapes";
const SHOW_STYLE_KEY = "napkin:showStyle";
const storageKey = (slug: string) => `napkin:scene:${slug}`;

const PEN_TOOL = {
  type: "freedraw",
  customType: null,
  lastActiveTool: null,
  locked: false,
} as const;

function loadScene(slug: string) {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadSmartShapes(): boolean {
  try {
    return window.localStorage.getItem(SMART_SHAPES_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Whether Excalidraw's style panel (stroke, fill, fonts, opacity…) is shown.
 * Read through useSyncExternalStore so the server render (and hydration)
 * always sees the default, hidden.
 */
const showStyleListeners = new Set<() => void>();
/** Last value set this session, so the toggle works even if storage throws. */
let memoryShowStyle: boolean | null = null;

function readShowStyle(): boolean {
  try {
    return window.localStorage.getItem(SHOW_STYLE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeShowStyle(next: boolean) {
  try {
    window.localStorage.setItem(SHOW_STYLE_KEY, String(next));
  } catch {
    // Preference just won't persist; the in-memory value below still applies.
  }
  memoryShowStyle = next;
  showStyleListeners.forEach((fn) => fn());
}

function subscribeShowStyle(fn: () => void) {
  showStyleListeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SHOW_STYLE_KEY) {
      memoryShowStyle = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    showStyleListeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

const getShowStyle = () => memoryShowStyle ?? readShowStyle();
const getServerShowStyle = () => false;

const isLinear = (el: ExcalidrawElement): el is ExcalidrawLinearElement =>
  el.type === "line" || el.type === "arrow";

/** Turns our plain props into full Excalidraw elements (one per skeleton, in order). */
function buildElements(lib: ExcalidrawModule, skeletons: ShapeSkeleton[]): ExcalidrawElement[] {
  const els = lib.convertToExcalidrawElements(
    skeletons as unknown as ExcalidrawElementSkeleton[],
  );
  // convertToExcalidrawElements substitutes a default size for a 0 width/height
  // on lines; keep the real extent so bounds and hit-testing match the points.
  return els.map((el, i) => {
    const sk = skeletons[i];
    return sk.type === "line" || sk.type === "arrow"
      ? ({ ...el, width: sk.width, height: sk.height } as ExcalidrawElement)
      : el;
  });
}

function buildElement(lib: ExcalidrawModule, skeleton: ShapeSkeleton): ExcalidrawElement {
  return buildElements(lib, [skeleton])[0];
}

function SmartShapesToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Smart shapes"
      onClick={() => onChange(!enabled)}
      title="Turn freehand boxes, diamonds, database cylinders, lines and arrows into clean shapes"
      className={`press flex h-9 select-none items-center gap-2 whitespace-nowrap rounded-full pl-3 pr-2 text-[12.5px] max-sm:pl-2 font-medium shadow-float ${
        enabled ? "bg-panel text-fg" : "bg-panel text-fg-2"
      } hover:text-fg`}
    >
      <span className="max-sm:hidden">Smart shapes</span>
      <span
        aria-hidden
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
          enabled ? "bg-accent" : "bg-line"
        }`}
      >
        <span
          className={`inline-block size-3 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out-quint ${
            enabled ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function StyleToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? "Hide style options" : "Show style options"}
      onClick={() => onChange(!enabled)}
      title={
        enabled
          ? "Hide style options (stroke, fill, fonts, opacity)"
          : "Show style options (stroke, fill, fonts, opacity)"
      }
      className={`press flex size-9 shrink-0 select-none items-center justify-center rounded-full shadow-float ${
        enabled ? "bg-panel text-accent" : "bg-panel text-fg-2"
      } hover:text-fg`}
    >
      {/* Palette */}
      <svg
        aria-hidden
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
        <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
        <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="7" r="1" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

export function Scratchpad({ slug }: { slug: string }) {
  const { theme } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<(() => void) | null>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const lib = useRef<ExcalidrawModule | null>(null);
  /** Freedraw ids we've already run the recognizer on (survives undo/redo). */
  const processed = useRef(new Set<string>());
  const recentLine = useRef<{ id: string; at: number } | null>(null);
  /** Recent strokes left as ink, which may be one half of a two-stroke cylinder. */
  const recentInk = useRef<{ id: string; at: number }[]>([]);

  const [smartShapes, setSmartShapes] = useState(() =>
    typeof window === "undefined" ? true : loadSmartShapes(),
  );
  const smartRef = useRef(smartShapes);
  useEffect(() => {
    smartRef.current = smartShapes;
  }, [smartShapes]);

  const toggleSmartShapes = useCallback((next: boolean) => {
    setSmartShapes(next);
    try {
      window.localStorage.setItem(SMART_SHAPES_KEY, String(next));
    } catch {
      // Preference just won't persist.
    }
  }, []);

  const showStyle = useSyncExternalStore(subscribeShowStyle, getShowStyle, getServerShowStyle);

  // With style hidden, also drop the main menu's canvas background picker.
  const uiOptions = useMemo<ExcalidrawProps["UIOptions"]>(
    () => ({ canvasActions: { changeViewBackgroundColor: showStyle } }),
    [showStyle],
  );

  const initialData = useMemo<InitialData>(() => {
    const saved = typeof window === "undefined" ? null : loadScene(slug);
    return {
      ...saved,
      appState: { ...saved?.appState, activeTool: PEN_TOOL },
    };
  }, [slug]);

  // Flush (rather than drop) a pending debounced save on unmount.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pendingSave.current?.();
      pendingSave.current = null;
    },
    [],
  );

  const handleChange = useCallback<OnChange>(
    (elements, appState, files) => {
      if (timer.current) clearTimeout(timer.current);
      const save = () => {
        pendingSave.current = null;
        timer.current = null;
        try {
          const scene = {
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
              zoom: appState.zoom,
            },
            files,
          };
          window.localStorage.setItem(storageKey(slug), JSON.stringify(scene));
        } catch {
          // Storage full or unavailable; drawing still works, it just won't persist.
        }
      };
      pendingSave.current = save;
      timer.current = setTimeout(save, SAVE_DELAY_MS);
    },
    [slug],
  );

  const handleApi = useCallback((instance: ExcalidrawImperativeAPI) => {
    api.current = instance;
    // Already loaded by next/dynamic; this just hands us the module's helpers.
    void import("@excalidraw/excalidraw").then((m) => {
      lib.current = m;
    });
  }, []);

  /** Runs once per finished freedraw stroke, after Excalidraw has committed it. */
  const processStroke = useCallback((id: string) => {
    const excalidraw = api.current;
    const mod = lib.current;
    if (!excalidraw || !mod || !smartRef.current) return;
    if (processed.current.has(id)) return;

    const elements = excalidraw.getSceneElementsIncludingDeleted();
    const stroke = elements.find((el) => el.id === id);
    if (!stroke || stroke.isDeleted || stroke.type !== "freedraw") return;
    processed.current.add(id);

    const freedraw = stroke as ExcalidrawFreeDrawElement;
    const points = elementPointsToScene(freedraw);
    if (points.length < 2) return;

    const commit = (next: readonly ExcalidrawElement[]) =>
      excalidraw.updateScene({
        elements: next,
        captureUpdate: mod.CaptureUpdateAction.IMMEDIATELY,
      });

    const now = Date.now();

    // 1. Does this stroke complete a cylinder with a recent ink stroke
    //    (a flat loop and a "U" beneath it, in either order)?
    recentInk.current = recentInk.current.filter(
      (r) => r.id !== id && now - r.at <= CYLINDER_WINDOW_MS,
    );
    for (let i = recentInk.current.length - 1; i >= 0; i--) {
      const other = elements.find((el) => el.id === recentInk.current[i].id);
      if (!other || other.isDeleted || other.type !== "freedraw") continue;
      const cylinder = detectCylinder(
        elementPointsToScene(other as ExcalidrawFreeDrawElement),
        points,
      );
      if (!cylinder) continue;
      const parts = buildElements(mod, shapeToSkeletons(cylinder, freedraw));
      const next = elements.flatMap((el) => {
        if (el.id === other.id) return [mod.newElementWith(el, { isDeleted: true })];
        if (el.id === freedraw.id) return [mod.newElementWith(el, { isDeleted: true }), ...parts];
        return [el];
      });
      commit(next);
      recentInk.current.splice(i, 1);
      recentLine.current = null;
      return;
    }

    // 2. Is this a second stroke that puts an arrowhead on a line?
    const recent =
      recentLine.current && now - recentLine.current.at <= ARROWHEAD_WINDOW_MS
        ? recentLine.current.id
        : null;
    const candidates: ArrowheadCandidate[] = [];
    for (const el of elements) {
      if (el.isDeleted || !isLinear(el)) continue;
      const ends = linearEndpoints(el);
      if (ends) candidates.push({ id: el.id, ...ends });
    }
    const match = findArrowheadTarget(points, candidates, detectArrowhead, {
      preferredId: recent,
    });
    if (match) {
      const line = elements.find((el) => el.id === match.id) as ExcalidrawLinearElement;
      const head = match.side === "end" ? "endArrowhead" : "startArrowhead";
      let replacement: ExcalidrawElement;
      if (line.type === "arrow") {
        replacement = mod.newElementWith(line, { [head]: "arrow" });
      } else {
        const ends = linearEndpoints(line)!;
        replacement = buildElement(
          mod,
          linearSkeleton("arrow", ends.start, ends.end, line, {
            startArrowhead: line.startArrowhead ?? (match.side === "start" ? "arrow" : null),
            endArrowhead: line.endArrowhead ?? (match.side === "end" ? "arrow" : null),
          }),
        );
      }
      const next = elements.flatMap((el) => {
        if (el.id === freedraw.id) return [mod.newElementWith(el, { isDeleted: true })];
        if (el.id === line.id) {
          return replacement.id === line.id
            ? [replacement]
            : [mod.newElementWith(el, { isDeleted: true }), replacement];
        }
        return [el];
      });
      commit(next);
      recentLine.current = { id: replacement.id, at: now };
      return;
    }

    // 3. Otherwise, is the stroke itself a shape?
    const shape = recognizeShape(points);
    if (!shape) {
      // Leave it as ink, but it may yet become half of a cylinder.
      recentInk.current = [...recentInk.current, { id, at: now }].slice(-CYLINDER_CANDIDATES);
      return;
    }
    const created = buildElements(mod, shapeToSkeletons(shape, freedraw));
    commit(
      elements.flatMap((el) =>
        el.id === freedraw.id ? [mod.newElementWith(el, { isDeleted: true }), ...created] : [el],
      ),
    );
    const single = created.length === 1 ? created[0] : null;
    recentLine.current = single && isLinear(single) ? { id: single.id, at: now } : null;
  }, []);

  const handlePointerUp = useCallback<NonNullable<ExcalidrawProps["onPointerUp"]>>(() => {
    if (!smartRef.current) return;
    // Fired just before Excalidraw finalizes the stroke, so newElement is still set.
    const stroke = api.current?.getAppState().newElement;
    if (!stroke || stroke.type !== "freedraw") return;
    const id = stroke.id;
    // Wait until the finalize has rendered and been recorded as its own history
    // entry, so a single undo after conversion brings the stroke back.
    requestAnimationFrame(() => setTimeout(() => processStroke(id), 0));
  }, [processStroke]);

  const renderTopRightUI = useCallback(
    () => (
      <div className="flex items-center gap-2">
        <StyleToggle enabled={showStyle} onChange={writeShowStyle} />
        <SmartShapesToggle enabled={smartShapes} onChange={toggleSmartShapes} />
      </div>
    ),
    [showStyle, smartShapes, toggleSmartShapes],
  );

  return (
    <div className={`napkin-canvas h-full w-full${showStyle ? "" : " napkin-minimal"}`}>
      <Excalidraw
        excalidrawAPI={handleApi}
        initialData={initialData}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        renderTopRightUI={renderTopRightUI}
        UIOptions={uiOptions}
        theme={theme}
      />
    </div>
  );
}
