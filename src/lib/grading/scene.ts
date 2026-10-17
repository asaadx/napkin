/** Reads what the grader needs from a saved Excalidraw scene. Pure. */

type SceneElement = {
  type?: unknown;
  isDeleted?: unknown;
  text?: unknown;
  containerId?: unknown;
  groupIds?: unknown;
};

export type SceneSummary = {
  /** One entry per drawn shape; text bound to a shape is folded into `labels`. */
  shapeKinds: string[];
  labels: string[];
};

export const sceneStorageKey = (slug: string) => `napkin:scene:${slug}`;

export function summarizeScene(scene: unknown): SceneSummary {
  const raw = (scene as { elements?: unknown } | null)?.elements;
  const elements = (Array.isArray(raw) ? raw : []).filter(
    (el): el is SceneElement => !!el && typeof el === "object" && !(el as SceneElement).isDeleted,
  );

  const labels: string[] = [];
  const kinds: string[] = [];
  // A smart-shape cylinder is an ellipse plus a line in the same group.
  const ellipseGroups = new Set(
    elements.filter((el) => el.type === "ellipse").flatMap((el) => groupsOf(el)),
  );
  const cylinderGroups = new Set<string>();
  for (const el of elements) {
    if (el.type === "line") {
      const g = groupsOf(el).find((id) => ellipseGroups.has(id));
      if (g) cylinderGroups.add(g);
    }
  }

  for (const el of elements) {
    const type = typeof el.type === "string" ? el.type : "unknown";
    const groups = groupsOf(el);
    const inCylinder = groups.some((g) => cylinderGroups.has(g));
    if (type === "text") {
      const text = typeof el.text === "string" ? el.text.replace(/\s+/g, " ").trim() : "";
      if (text) labels.push(text);
      if (!el.containerId) kinds.push("text");
    } else if (inCylinder) {
      if (type === "ellipse") kinds.push("cylinder");
      // The cylinder's body line isn't a separate shape.
    } else {
      kinds.push(type);
    }
  }
  return { shapeKinds: kinds, labels };
}

function groupsOf(el: SceneElement): string[] {
  return Array.isArray(el.groupIds) ? el.groupIds.filter((g): g is string => typeof g === "string") : [];
}
