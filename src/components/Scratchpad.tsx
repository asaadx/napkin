"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import "@excalidraw/excalidraw/index.css";

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

type ExcalidrawProps = React.ComponentProps<typeof Excalidraw>;
type OnChange = NonNullable<ExcalidrawProps["onChange"]>;
type InitialData = ExcalidrawProps["initialData"];

const SAVE_DELAY_MS = 500;
const storageKey = (slug: string) => `napkin:scene:${slug}`;

function loadScene(slug: string): InitialData {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
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

export function Scratchpad({ slug }: { slug: string }) {
  const dark = usePrefersDark();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialData = useMemo(
    () => (typeof window === "undefined" ? null : loadScene(slug)),
    [slug],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleChange = useCallback<OnChange>(
    (elements, appState, files) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
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
      }, SAVE_DELAY_MS);
    },
    [slug],
  );

  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        theme={dark ? "dark" : "light"}
      />
    </div>
  );
}
