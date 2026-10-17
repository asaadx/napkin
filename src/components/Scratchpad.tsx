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
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
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
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
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

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersDark() {
  return useSyncExternalStore(
    subscribeDark,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

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
    <label
      className="flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      title="Turn freehand boxes, diamonds, database cylinders, lines and arrows into clean shapes"
    >
      <span className="whitespace-nowrap">Smart shapes</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Smart shapes"
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-indigo-500" : "bg-neutral-300 dark:bg-neutral-600"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export function Scratchpad({ slug }: { slug: string }) {
  const dark = usePrefersDark();
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
    () => <SmartShapesToggle enabled={smartShapes} onChange={toggleSmartShapes} />,
    [smartShapes, toggleSmartShapes],
  );

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={handleApi}
        initialData={initialData}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        renderTopRightUI={renderTopRightUI}
        theme={dark ? "dark" : "light"}
      />
    </div>
  );
}
