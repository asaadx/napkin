import type { CSSProperties } from "react";

/**
 * Scroll-driven animation helpers.
 *
 * Every animated element carries its keyframes, a timeline name and its slice
 * (a..b, 0..1) of that timeline. Three consumers read the same props:
 *  - native: landing.css binds `.ln-k` to a CSS view timeline (animation-timeline)
 *  - fallback: ScrubFallback reads the data-* attributes and scrubs a paused animation
 *  - static: the "STATIC" timeline renders the finished state, no scroll involved
 */

export const STATIC = "static";
export const TL = "--ln-track";

/** Pinned track: four chapters plus the zoom-out ending, written in chapter space. */
export const SC = 0.8;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export type KProps = {
  className?: string;
  style?: CSSProperties;
  "data-k"?: string;
  "data-tl"?: string;
  "data-a"?: string;
  "data-b"?: string;
};

export function k(
  keyframes: string,
  tl: string,
  a: number,
  b: number,
  opts: { origin?: string; className?: string; style?: CSSProperties } = {},
): KProps {
  const name = `ln-${keyframes}`;
  const base: CSSProperties = { ...(opts.origin ? { transformOrigin: opts.origin } : {}), ...opts.style };

  if (tl === STATIC) {
    // Finished state: a paused animation parked at its last frame.
    return {
      className: opts.className,
      style: {
        ...base,
        animation: `${name} 1s linear both paused`,
        animationDelay: "-0.9999s",
      },
    };
  }

  const style = {
    ...base,
    "--k": name,
    "--tl": tl,
    "--a": `${(a * 100).toFixed(3)}%`,
    "--b": `${(b * 100).toFixed(3)}%`,
  } as CSSProperties;

  return {
    className: ["ln-k", opts.className].filter(Boolean).join(" "),
    style,
    "data-k": name,
    "data-tl": tl,
    "data-a": a.toFixed(4),
    "data-b": b.toFixed(4),
  };
}

/** Like k, for elements that also carry their own class. */
export function kc(
  className: string,
  keyframes: string,
  tl: string,
  a: number,
  b: number,
  opts: { origin?: string; style?: CSSProperties } = {},
): KProps {
  return k(keyframes, tl, a, b, { ...opts, className });
}

/** Split [a, b] into n equal slices and return slice i. */
export function slice(a: number, b: number, i: number, n: number): [number, number] {
  return [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n];
}

export { clamp };

export type Range = [number, number];

/** Shared timing for chapter space (0..1 across the four chapters). */
export type Timings = {
  client: Range;
  api: Range;
  db: Range;
  ar1: Range;
  ar2: Range;
  pill: { grow: Range; inn: Range; wave: Range };
  tx: { in: Range; words: Range; out: Range };
  round: { card: Range; bar: Range; quote: Range; out: Range };
  cache: Range;
  cacheAr: Range;
  rep: Range;
  grade: { card: Range; bars: Range; chip: Range };
};

export const RA: Timings = {
  client: [0.02, 0.08],
  api: [0.09, 0.15],
  db: [0.15, 0.18],
  ar1: [0.17, 0.19],
  ar2: [0.185, 0.2],
  pill: { grow: [0.26, 0.29], inn: [0.285, 0.305], wave: [0.3, 0.5] },
  tx: { in: [0.28, 0.31], words: [0.31, 0.45], out: [0.5, 0.53] },
  round: { card: [0.51, 0.55], bar: [0.54, 0.58], quote: [0.55, 0.58], out: [0.76, 0.78] },
  cache: [0.58, 0.62],
  cacheAr: [0.61, 0.645],
  rep: [0.645, 0.69],
  grade: { card: [0.77, 0.81], bars: [0.8, 0.92], chip: [0.92, 0.95] },
};

const scaleRange = (r: Range): Range => [r[0] * SC, r[1] * SC];

/** RA scaled into the pinned track (chapters occupy 0..SC). */
export const RF: Timings = {
  client: scaleRange(RA.client),
  api: scaleRange(RA.api),
  db: scaleRange(RA.db),
  ar1: scaleRange(RA.ar1),
  ar2: scaleRange(RA.ar2),
  pill: { grow: scaleRange(RA.pill.grow), inn: scaleRange(RA.pill.inn), wave: scaleRange(RA.pill.wave) },
  tx: { in: scaleRange(RA.tx.in), words: scaleRange(RA.tx.words), out: scaleRange(RA.tx.out) },
  round: {
    card: scaleRange(RA.round.card),
    bar: scaleRange(RA.round.bar),
    quote: scaleRange(RA.round.quote),
    out: scaleRange(RA.round.out),
  },
  cache: scaleRange(RA.cache),
  cacheAr: scaleRange(RA.cacheAr),
  rep: scaleRange(RA.rep),
  grade: {
    card: scaleRange(RA.grade.card),
    bars: scaleRange(RA.grade.bars),
    chip: scaleRange(RA.grade.chip),
  },
};
