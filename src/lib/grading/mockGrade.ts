/**
 * A deterministic, heuristic stand-in for the AI grader.
 *
 * It returns the same `GradeResult` shape the real grader will, and it reacts
 * to the actual attempt: keyword and number signals from the transcript, plus
 * box and arrow counts from the diagram. It cannot judge whether a design is
 * correct, only whether the expected topics came up. The UI labels it as a mock.
 *
 * Pure: no React, no storage, no clock, no randomness.
 */

import {
  DIMENSION_NAMES,
  type DimensionName,
  type DimensionScore,
  type GradeDimension,
  type GradeResult,
  type GradingPrompt,
  type Improvement,
  type LevelSignal,
} from "./types";

export type MockGradeInput = {
  prompt: GradingPrompt;
  transcriptText: string;
  /** Excalidraw element types of the non-deleted elements, e.g. "rectangle", "arrow", "text". */
  shapeKinds: string[];
  durationMs: number;
  /** Text labels on the diagram, if known. */
  diagramLabels?: string[];
};

/** Below this many words with a blank canvas, the attempt is too thin to grade. */
export const MIN_WORDS = 60;

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

type Concept = { label: string; re: RegExp };
const c = (label: string, re: RegExp): Concept => ({ label, re });

const CLARIFY: Concept[] = [
  c("assumptions", /\bassum(e|ing|ption)/),
  c("requirements", /\brequirements?\b/),
  c("clarifying", /\bclarif(y|ying|ication)\b/),
  c("scope", /\b(out of|in) scope\b|\bscope\b/),
  c("non-functional", /\bnon[- ]?functional\b/),
  c("focus", /\bfocus(ing)? on\b|\bcore (use case|features?)\b|\bmvp\b/),
  c("latency target", /\b(latency|p99|p95|availability|consisten(t|cy)|durab(le|ility))\b/),
];

const NUMBER = /\b\d+(?:[.,]\d+)?\s*(?:k|m|b|%|x)?\b|\b(?:hundred|thousand|million|billion|trillion)s?\b/g;

const ESTIMATE: Concept[] = [
  c("estimate", /\bestimat(e|ing|ion)\b|\bback[- ]of[- ](the[- ])?envelope\b|\brough(ly)?\b|\bballpark\b/),
  c("throughput", /\bper second\b|\bqps\b|\brps\b|\bthroughput\b|\brequests? a second\b/),
  c("storage", /\bstorage\b|\b(tera|peta|giga|mega)bytes?\b|\b\d+\s*(tb|pb|gb|mb|kb)\b/),
  c("bandwidth", /\bbandwidth\b|\begress\b/),
  c("read/write ratio", /\bread[- ]heavy\b|\bwrite[- ]heavy\b|\bratio\b|\breads? (to|versus|vs) writes?\b/),
  c("per day", /\bper (day|month|year)\b|\ba day\b|\bdaily\b/),
];

const COMPONENTS: Concept[] = [
  c("client", /\bclients?\b|\bbrowser\b|\bmobile app\b/),
  c("load balancer", /\bload ?balanc(er|ers|ing)\b|\blb\b/),
  c("gateway", /\b(api )?gateway\b/),
  c("service", /\b(app(lication)? )?servers?\b|\bservices?\b|\bbackend\b/),
  c("worker", /\bworkers?\b|\bconsumers?\b/),
  c("queue", /\bqueues?\b|\bkafka\b|\bpub[/ -]?sub\b|\bstream(s|ing)?\b/),
  c("cache", /\bcach(e|es|ing)\b|\bredd?is\b|\bmemcache/),
  c("database", /\bdatabases?\b|\bdb\b|\bdatastore\b/),
  c("cdn", /\bcdn\b/),
  c("connection", /\bweb ?sockets?\b|\blong[- ]poll/),
];

const FLOW = /\b(request|requests) (goes|go|hits|comes)\b|\bgoes to\b|\bsends?\b|\bforwards?\b|\breturns?\b|\bthen (it|we|the)\b|\bflows?\b/;

const STORAGE: Concept[] = [
  c("database", /\bdatabases?\b|\bdb\b/),
  c("engine", /\b(sql|postgres|postgresql|mysql|nosql|cassandra|dynamo(db)?|mongo(db)?|bigtable|key[- ]value|kv store|s3|blob|object stor(e|age))\b/),
];
const SCHEMA: Concept[] = [
  c("schema", /\bschemas?\b|\btables?\b|\bcolumns?\b|\brows?\b/),
  c("keys", /\b(primary|partition|sort|row|shard) key\b|\bkeyed by\b|\bindex(es|ed)?\b/),
  c("ids", /\b\w+ ?id\b|\bids\b/),
];
const API = /\bapis?\b|\bendpoints?\b|\b(get|post|put|patch|delete) (request|endpoint|call|\/)|\brest(ful)?\b|\bgrpc\b/;
const JUSTIFY = /\baccess patterns?\b|\blook ?ups?\b|\bquer(y|ies)\b|\bbecause\b|\bso that\b/;

const SCALING: Concept[] = [
  c("caching", /\bcach(e|es|ing)\b|\bredd?is\b|\bmemcache/),
  c("sharding", /\bshard(s|ed|ing)?\b|\bshart(ing)?\b|\bpartition(s|ed|ing)?\b|\bconsistent hashing\b/),
  c("replication", /\breplica(s|tion|ted)?\b|\breplicat(e|ing)\b|\bleader\b|\bfollowers?\b/),
  c("failure handling", /\bfail ?over\b|\bfailures?\b|\bredundan(t|cy)\b|\bsingle point of failure\b|\bretr(y|ies)\b|\bbackups?\b|\bgoes down\b/),
  c("horizontal scaling", /\bhorizontal(ly)?\b|\bscale out\b|\bstateless\b|\bautoscal/),
  c("hot spots", /\bhot ?(keys?|spots?|partitions?)\b|\bbottlenecks?\b|\bcelebrit/),
  c("async work", /\bqueues?\b|\basync(hronous(ly)?)?\b|\bbackground\b|\bkafka\b/),
  c("CDN", /\bcdn\b|\bedge\b/),
  c("multi-region", /\bregions?\b|\bavailability zones?\b|\bdata ?cent(er|re)s?\b/),
];

const TRADEOFF: Concept[] = [
  c("trade-off", /\btrade[- ]?offs?\b/),
  c("instead", /\binstead of\b|\brather than\b/),
  c("versus", /\bversus\b|\bvs\.?\b|\bcompared to\b/),
  c("alternative", /\balternatives?(ly)?\b|\banother option\b|\bon the other hand\b|\bor we could\b/),
  c("downside", /\bdownsides?\b|\bthe cost (is|of)\b|\bpros and cons\b|\bdrawbacks?\b/),
  c("decision", /\bi('d| would)? (go with|choose|pick)\b|\bwe('ll| will)? (go with|use)\b|\bchose\b|\bpicked\b/),
];
/** Giving a reason counts a little, even without naming an alternative. */
const REASONING = /\bbecause\b|\bso that\b|\bwhich means\b|\bthat way\b/;
const STRUCTURE: Concept[] = [
  c("start", /\b(first|let me start|to start|start with)\b/),
  c("sequence", /\b(next|then|after that|second)\b/),
  c("wrap", /\b(finally|to summarize|in summary|overall|to wrap up)\b/),
];

const STOPWORDS = new Set(
  "about above after again against among because before being below between both could does doing during each every from further have having into itself just more most other over same should since some such than that their them then there these they this those through under until very what when where which while will with within would your users user able system highly support supports".split(
    " ",
  ),
);

const TRAILING = /^(a|an|the|to|of|and|or|but|so|in|on|at|for|with|is|are|that|we|i|it)$/i;

const BOX_KINDS = new Set(["rectangle", "diamond", "ellipse", "image", "frame", "embeddable", "cylinder"]);

function present(text: string, concepts: Concept[]): Concept[] {
  return concepts.filter((k) => k.re.test(text));
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

/**
 * A short phrase from the transcript around the first match of `re`,
 * quoted, or null if `re` never matches.
 */
export function quote(transcript: string, re: RegExp, maxWords = 10): string | null {
  const words = transcript.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const lower = words.join(" ").toLowerCase();
  const flags = re.flags.replace("g", "");
  const m = new RegExp(re.source, flags).exec(lower);
  if (!m) return null;

  // Map the match's character offset back to word indices.
  let offset = 0;
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    if (offset + words[i].length > m.index) {
      first = i;
      break;
    }
    offset += words[i].length + 1;
  }
  const matchWords = Math.max(1, m[0].trim().split(/\s+/).length);
  const before = 3;
  const start = Math.max(0, first - before);
  const end = Math.min(words.length, start + Math.max(maxWords, matchWords + before));
  const window = words.slice(start, end);
  // Don't end a quote on a dangling connective ("...in front of the database to").
  while (window.length > matchWords + 1 && TRAILING.test(window[window.length - 1])) window.pop();
  const phrase = window
    .join(" ")
    .replace(/^[^\w"']+|[^\w%"')]+$/g, "");
  return `"${phrase}"`;
}

/** The first concept that matches, quoted. */
function quoteFirst(transcript: string, concepts: Concept[]): string | null {
  for (const k of concepts) {
    const q = quote(transcript, k.re);
    if (q) return q;
  }
  return null;
}

function stem(word: string): string {
  const s = word.replace(/(ing|ed|es|s)$/, "");
  return s.length >= 4 ? s : word;
}

/** Distinctive stems of one requirement line. */
function requirementStems(line: string): string[] {
  const words = line.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= 5 && !STOPWORDS.has(w)).map(stem))];
}

function requirementCoverage(lower: string, requirements: string[]) {
  const covered: string[] = [];
  const missed: string[] = [];
  for (const req of requirements) {
    const stems = requirementStems(req);
    if (!stems.length) continue;
    const hits = stems.filter((s) => lower.includes(s)).length;
    // One distinctive word for short lines, two for longer ones.
    (hits >= (stems.length <= 3 ? 1 : 2) ? covered : missed).push(req);
  }
  const total = covered.length + missed.length;
  return { covered, missed, ratio: total ? covered.length / total : 0 };
}

const bucket = (points: number, t4: number, t3: number, t2: number): DimensionScore =>
  points >= t4 ? 4 : points >= t3 ? 3 : points >= t2 ? 2 : 1;

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : /(x|s|ch|sh)$/.test(word) ? "es" : "s"}`;

const clip = (s: string, max = 90) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

// ---------------------------------------------------------------------------
// Weights per prompt
// ---------------------------------------------------------------------------

/** How much each dimension counts toward the overall score for this prompt. */
function weightsFor(title: string): number[] {
  //          req  est  hld  data scale trade
  const w = [1.0, 1.0, 1.2, 1.0, 1.2, 1.0];
  const t = title.toLowerCase();
  if (/shorten|url|paste|bin/.test(t)) w[3] = 1.5;
  if (/feed|timeline|news/.test(t)) {
    w[1] = 1.4;
    w[4] = 1.5;
  }
  if (/chat|messag/.test(t)) w[4] = 1.4;
  if (/rate ?limit/.test(t)) {
    w[3] = 1.3;
    w[4] = 1.4;
  }
  if (/notif/.test(t)) w[4] = 1.4;
  return w;
}

// ---------------------------------------------------------------------------
// Per-dimension copy
// ---------------------------------------------------------------------------

const STRONG_CLAUSE: Record<DimensionName, string> = {
  "Requirements & scoping": "you scoped the problem before designing",
  Estimation: "you let the scale numbers drive the design",
  "High-level design": "the core data flow holds together end to end",
  "Data model & APIs": "the storage choice is tied to the access pattern",
  "Scaling & reliability": "you went after the real bottlenecks",
  "Trade-offs & communication": "you named alternatives and picked a side",
};

const WEAK_CLAUSE: Record<DimensionName, string> = {
  "Requirements & scoping": "the requirements were never pinned down",
  Estimation: "the scale numbers never shaped a decision",
  "High-level design": "the end-to-end flow is incomplete",
  "Data model & APIs": "the data model and APIs stayed vague",
  "Scaling & reliability": "scaling and failure modes went mostly unaddressed",
  "Trade-offs & communication": "choices came without the alternatives behind them",
};

const DRILL: Record<DimensionName, string> = {
  "Requirements & scoping":
    "Spend the first three minutes of your next attempt only on requirements: restate the functional ones, confirm the non-functional targets out loud, and say one thing you are leaving out of scope.",
  Estimation:
    "Before drawing anything next time, do a two-minute estimate from the scale numbers: requests per second at peak, storage per year, and one decision those numbers force.",
  "High-level design":
    "Sketch the request path for each functional requirement as its own arrow sequence, client to storage and back, and check that every requirement has one.",
  "Data model & APIs":
    "Write the two or three core API calls and the main table or key layout before you talk about scaling, and say which query each one serves.",
  "Scaling & reliability":
    "Pick the single hottest path in your design and walk through what breaks at ten times the stated load and what happens when one node in it dies.",
  "Trade-offs & communication":
    "For each major component next time, say one alternative you considered and the one reason you didn't pick it, in a single sentence.",
};

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

type Scored = GradeDimension & {
  weight: number;
  /** Feeds strengths and improvements. */
  strength: string;
  improvement: Improvement;
};

export function mockGrade(input: MockGradeInput): GradeResult {
  const transcript = input.transcriptText.replace(/\s+/g, " ").trim();
  const lower = transcript.toLowerCase();
  const words = countWords(transcript);
  const kinds = input.shapeKinds.map((k) => k.toLowerCase());
  const labels = (input.diagramLabels ?? []).map((l) => l.trim()).filter(Boolean);
  const labelText = labels.join(" ").toLowerCase();

  if (words < MIN_WORDS && kinds.length === 0) return insufficient(words);

  const boxes = kinds.filter((k) => BOX_KINDS.has(k)).length;
  const arrows = kinds.filter((k) => k === "arrow").length;
  const lines = kinds.filter((k) => k === "line").length;
  const connectors = arrows + Math.floor(lines / 2);
  const diagramNote = boxes || connectors
    ? `Diagram has ${plural(boxes, "box")} and ${plural(connectors, "connector")}${labels.length ? `, labelled ${list(labels.slice(0, 4).map((l) => `"${clip(l, 24)}"`))}` : ""}.`
    : "";
  const talked = words >= 30;
  const weights = weightsFor(input.prompt.title);
  const scale = input.prompt.scale ?? [];
  const scaleExample = scale[0] ? `"${clip(scale[0], 60)}"` : "the stated scale numbers";

  // 1. Requirements & scoping ------------------------------------------------
  const requirements = [...(input.prompt.functional ?? []), ...(input.prompt.nonFunctional ?? [])];
  const coverage = requirementCoverage(lower, requirements);
  const clarify = present(lower, CLARIFY);
  const reqPoints = requirements.length
    ? coverage.ratio * 2 + Math.min(clarify.length, 3) * 0.5
    : Math.min(clarify.length, 3) * 0.85;
  const reqScore = talked ? bucket(reqPoints, 2.6, 1.6, 0.6) : 1;
  const firstMissed = coverage.missed[0];
  const req: Scored = {
    name: "Requirements & scoping",
    score: reqScore,
    weight: weights[0],
    evidence:
      reqScore === 1 && !clarify.length
        ? "Not covered: the transcript never states requirements or assumptions."
        : [
            quoteFirst(transcript, clarify) ?? "",
            requirements.length
              ? `Touched ${coverage.covered.length} of ${requirements.length} stated requirements.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
    feedback: [
      "",
      firstMissed
        ? `You moved into the design without confirming what it has to do; "${clip(firstMissed, 70)}" never came up. Restate the functional and non-functional requirements in your own words before drawing anything.`
        : "You moved into the design without confirming what it has to do. Restate the requirements and say what you're assuming before drawing anything.",
      firstMissed
        ? `You named some requirements, but "${clip(firstMissed, 70)}" never came up. A strong answer confirms each one and says which it's deliberately leaving out.`
        : "You touched the requirements but didn't state your assumptions. Say out loud what you are assuming and what you're leaving out of scope.",
      firstMissed
        ? `You covered most of the requirements and kept scope reasonable. The one that slipped was "${clip(firstMissed, 70)}"; check the list once more before moving on.`
        : "You covered the requirements and kept scope reasonable. To push this to a 4, name the ambiguity you resolved and why you resolved it that way.",
      "You confirmed the requirements, stated assumptions, and kept scope tight. This is the kind of opening that makes the rest of the interview easier.",
    ][reqScore],
    strength: `You opened by pinning down scope${coverage.covered.length ? `, covering ${coverage.covered.length} of ${requirements.length} stated requirements` : ""} before designing.`,
    improvement: {
      issue: firstMissed
        ? `You never addressed "${clip(firstMissed, 70)}".`
        : "You didn't confirm requirements or state assumptions.",
      what_strong_looks_like:
        "Spend the first few minutes restating the functional and non-functional requirements, confirm the targets that matter, and say what is out of scope.",
    },
  };

  // 2. Estimation ------------------------------------------------------------
  const numbers = lower.match(NUMBER)?.length ?? 0;
  const est = present(lower, ESTIMATE);
  const estScore: DimensionScore =
    numbers >= 4 && est.length >= 3 ? 4 : numbers >= 2 && est.length >= 2 ? 3 : numbers >= 1 || est.length >= 1 ? 2 : 1;
  const estQuote = quoteFirst(transcript, est) ?? quote(transcript, NUMBER);
  const estimation: Scored = {
    name: "Estimation",
    score: estScore,
    weight: weights[1],
    evidence: estQuote
      ? `${estQuote}${est.length ? ` Covered ${list(est.map((k) => k.label))}.` : ""}`
      : "Not covered: no numbers or estimates in the transcript.",
    feedback: [
      "",
      `You never used the scale numbers. Start from ${scaleExample} and turn it into requests per second and storage, then let that pick your storage and caching strategy.`,
      `You mentioned ${est.length ? list(est.map((k) => k.label)) : "a number"} but didn't carry it through. A strong answer finishes the math, even roughly, and names the decision it changes.`,
      "Your numbers were in the right range and you used them. To reach a 4, point at the specific design choice each estimate forced, such as the shard count or cache size.",
      `You turned the scale numbers into concrete figures (${list(est.map((k) => k.label))}) and let them drive the design. That's how the scale section should work.`,
    ][estScore],
    strength: `You did the math: ${estQuote ?? "your estimates"} set up the later design choices.`,
    improvement: {
      issue: estScore === 1 ? "You didn't estimate load or storage." : "Your estimates didn't drive any decisions.",
      what_strong_looks_like: `Turn ${scaleExample} into peak QPS and storage per year with rough math, then say which component that number stresses most.`,
    },
  };

  // 3. High-level design -----------------------------------------------------
  const comps = present(`${lower} ${labelText}`, COMPONENTS);
  const flow = FLOW.test(lower);
  const hldPoints =
    (comps.length >= 5 ? 2 : comps.length >= 3 ? 1.5 : comps.length >= 1 ? 0.75 : 0) +
    (boxes >= 4 && connectors >= 3 ? 2 : boxes >= 2 && connectors >= 1 ? 1.25 : boxes >= 1 ? 0.5 : 0) +
    (flow ? 0.5 : 0);
  const hldScore = bucket(hldPoints, 3.75, 2.5, 1);
  const hldQuote = quoteFirst(transcript, COMPONENTS);
  const hld: Scored = {
    name: "High-level design",
    score: hldScore,
    weight: weights[2],
    evidence:
      [hldQuote ?? "", diagramNote].filter(Boolean).join(" ") ||
      "Not covered: no components named and nothing on the canvas.",
    feedback: [
      "",
      boxes === 0
        ? "There's no diagram to follow, and the components you named don't connect into a flow. Sketch the boxes and draw the request path between them."
        : "The sketch has pieces but no clear path through them. Draw arrows for the main request so a reader can follow it from client to storage.",
      connectors === 0 && boxes > 0
        ? "You have the components on the canvas but nothing connecting them. Add arrows for the main read and write paths and talk through each one."
        : `You named ${list(comps.slice(0, 4).map((k) => k.label)) || "a few components"}, but the flow between them is thin. Walk one request end to end and check each functional requirement is served.`,
      "The core components and data flow are there and hang together. To reach a 4, walk a second path, such as the write path or a failure, through the same diagram.",
      "Components and data flow are clear, connected, and cover the requirements end to end. Your diagram and narration back each other up.",
    ][hldScore],
    strength: `Your diagram and narration agree: ${diagramNote ? diagramNote.replace(/\.$/, "").replace(/^Diagram has/, "the sketch has") : `you walked through ${list(comps.slice(0, 3).map((k) => k.label))}`}.`,
    improvement: {
      issue:
        boxes === 0 ? "There's no diagram of the system." : connectors === 0 ? "The diagram has boxes but no data flow." : "The end-to-end flow is incomplete.",
      what_strong_looks_like:
        "Draw the main components with arrows for the read and write paths, then narrate one request through them from client to storage and back.",
    },
  };

  // 4. Data model & APIs -----------------------------------------------------
  const storage = present(`${lower} ${labelText}`, STORAGE);
  const schema = present(lower, SCHEMA);
  const api = API.test(lower);
  const justify = JUSTIFY.test(lower);
  const hasDbShape = kinds.includes("cylinder") || /\b(db|database|store|postgres|sql|cassandra|dynamo)\b/.test(labelText);
  const dataPoints =
    (storage.length ? 1 : 0) +
    (storage.some((k) => k.label === "engine") ? 0.25 : 0) +
    (schema.length >= 2 ? 1 : schema.length ? 0.5 : 0) +
    (api ? 1 : 0) +
    (justify && storage.length ? 0.75 : 0) +
    (hasDbShape ? 0.25 : 0);
  const dataScore = bucket(dataPoints, 3.25, 2.25, 0.75);
  const dataQuote = quoteFirst(transcript, [...STORAGE, ...SCHEMA, c("api", API)]);
  const data: Scored = {
    name: "Data model & APIs",
    score: dataScore,
    weight: weights[3],
    evidence: dataQuote
      ? `${dataQuote}${api ? "" : " No API was described."}`
      : hasDbShape
        ? "Only a storage box on the diagram; no schema or API in the transcript."
        : "Not covered: no storage choice, schema, or API.",
    feedback: [
      "",
      "You never said where the data lives or how clients talk to the system. Name the storage, sketch the main table or key, and write the core API calls.",
      !api
        ? "You picked storage but didn't describe the API. Write the two or three core calls with their parameters so the data model has something to serve."
        : "You named storage, but not why it fits. Tie the choice to the access pattern: what's the key, what's the hot query, and how is it indexed.",
      "The API and storage choice are sensible. To reach a 4, justify the key design against the hottest query and say what you'd lose with the alternative store.",
      "API shape, key design, and storage choice are clear and justified by the access patterns.",
    ][dataScore],
    strength: `You tied storage to the access pattern: ${dataQuote ?? "your storage choice"}.`,
    improvement: {
      issue: !storage.length ? "You didn't choose or justify storage." : !api ? "You didn't define the API." : "The data model wasn't tied to the access pattern.",
      what_strong_looks_like:
        "State the core API calls, the primary key or partition key, and why that storage engine serves the hottest query better than the obvious alternative.",
    },
  };

  // 5. Scaling & reliability -------------------------------------------------
  const scaling = present(lower, SCALING);
  const scaleScore = bucket(scaling.length, 5, 3, 1);
  const missingScale = SCALING.filter((k) => !scaling.includes(k) && ["caching", "sharding", "replication", "failure handling"].includes(k.label)).map((k) => k.label);
  const scale_: Scored = {
    name: "Scaling & reliability",
    score: scaleScore,
    weight: weights[4],
    evidence: scaling.length
      ? `${quoteFirst(transcript, scaling)} Covered ${list(scaling.map((k) => k.label))}.`
      : "Not covered: no caching, partitioning, replication, or failure handling.",
    feedback: [
      "",
      `You didn't address what happens at this scale. Find the bottleneck that ${scaleExample} creates, then cover caching, partitioning, and what happens when a node fails.`,
      `You mentioned ${list(scaling.map((k) => k.label))}, but ${missingScale.length ? list(missingScale) : "the failure modes"} never came up. A strong answer names the real bottleneck first, then picks the technique that relieves it.`,
      missingScale.length
        ? `You covered the main scaling levers. ${missingScale[0][0].toUpperCase()}${missingScale[0].slice(1)} was the gap; say how the design behaves when that piece fails or runs hot.`
        : "You covered the main scaling levers. To reach a 4, say which bottleneck bites first at this scale and how you'd know.",
      "You found the real bottlenecks and covered caching, partitioning, replication, and failure handling with reasons.",
    ][scaleScore],
    strength: `You covered ${list(scaling.slice(0, 3).map((k) => k.label))} for scale.`,
    improvement: {
      issue: scaling.length
        ? `${list(missingScale.length ? missingScale : ["failure handling"])} never came up.`.replace(/^./, (s) => s.toUpperCase())
        : "You didn't address scaling or failure modes.",
      what_strong_looks_like:
        "Name the component that breaks first at the stated load, then say how you partition it, what you cache in front of it, and what happens when one replica dies.",
    },
  };

  // 6. Trade-offs & communication -------------------------------------------
  const trade = present(lower, TRADEOFF);
  const structure = present(lower, STRUCTURE);
  const tradePoints =
    Math.min(trade.length, 4) * 0.6 +
    (structure.length >= 2 ? 0.75 : structure.length ? 0.4 : 0) +
    (REASONING.test(lower) ? 0.4 : 0) +
    (words >= 400 ? 0.75 : words >= 200 ? 0.5 : words >= 100 ? 0.25 : 0);
  const tradeScore = talked ? (trade.length >= 3 ? bucket(tradePoints, 2.6, 1.6, 0.5) : Math.min(3, bucket(tradePoints, 2.6, 1.6, 0.5)) as DimensionScore) : 1;
  const tradeQuote = quoteFirst(transcript, trade);
  const tradeoffs: Scored = {
    name: "Trade-offs & communication",
    score: tradeScore,
    weight: weights[5],
    evidence: !talked
      ? `Only ${plural(words, "word")} of narration, so there was little to judge.`
      : tradeQuote
        ? `${tradeQuote}${structure.length ? "" : " The explanation had no clear structure."}`
        : `No alternatives named across ${plural(words, "word")} of narration.`,
    feedback: [
      "",
      talked
        ? "You described what you'd build but never why. For each major choice, name the alternative and the reason you rejected it."
        : "There's almost no narration, so the interviewer can't follow your reasoning. Talk through each decision as you make it.",
      "You named a choice or two but didn't weigh them. A strong answer says what the alternative buys, what it costs, and why this prompt tips the balance.",
      "You explained your choices and kept the conversation structured. To reach a 4, make at least one trade-off explicit with what you're giving up.",
      "You named alternatives, said why you picked one, and drove the conversation instead of wandering.",
    ][tradeScore],
    strength: `You weighed alternatives instead of just listing components: ${tradeQuote ?? "your reasoning"}.`,
    improvement: {
      issue: trade.length ? "Trade-offs were mentioned but not weighed." : "You didn't name any alternatives or trade-offs.",
      what_strong_looks_like:
        "For your two biggest decisions, say the alternative, what it would buy you, and the one reason it loses for this prompt.",
    },
  };

  const scored = [req, estimation, hld, data, scale_, tradeoffs];

  // Overall --------------------------------------------------------------------
  const totalWeight = scored.reduce((s, d) => s + d.weight, 0);
  const avg = scored.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
  const overall = Math.round(10 + ((avg - 1) / 3) * 85);
  const level = levelFor(overall, scored);

  const byStrength = [...scored].sort((a, b) => b.score - a.score || b.weight - a.weight);
  const byGap = [...scored].sort((a, b) => (4 - b.score) * b.weight - (4 - a.score) * a.weight);

  const strengths = byStrength.filter((d) => d.score >= 3).slice(0, 2).map((d) => d.strength);
  const top_improvements = byGap.filter((d) => d.score <= 3).slice(0, 3).map((d) => d.improvement);
  const weakest = byGap[0];

  return {
    insufficient: false,
    overall_score: overall,
    level_signal: level,
    headline: headline(byStrength, byGap),
    dimensions: DIMENSION_NAMES.map((name) => {
      const d = scored.find((s) => s.name === name)!;
      return { name: d.name, score: d.score, evidence: d.evidence, feedback: d.feedback };
    }),
    strengths,
    top_improvements,
    next_drill: DRILL[weakest.name],
  };
}

function levelFor(overall: number, dims: Scored[]): LevelSignal {
  if (overall < 45) return "below bar";
  if (overall < 62) return "mid-level";
  const tradeoffs = dims[5].score;
  const scaling = dims[4].score;
  if (overall >= 80 && tradeoffs === 4 && scaling >= 3) return "staff";
  return "senior";
}

function headline(byStrength: Scored[], byGap: Scored[]): string {
  const best = byStrength[0];
  const worst = byGap[0];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (best.score < 3) {
    const second = byGap[1];
    return `An early sketch: ${WEAK_CLAUSE[worst.name]}, and ${WEAK_CLAUSE[second.name]}.`;
  }
  if (worst.score >= 3) {
    return `${cap(STRONG_CLAUSE[best.name])}, and even the thinnest area, ${worst.name.toLowerCase()}, holds up.`;
  }
  return `${cap(STRONG_CLAUSE[best.name])}, but ${WEAK_CLAUSE[worst.name]}.`;
}

function insufficient(words: number): GradeResult {
  return {
    insufficient: true,
    overall_score: 0,
    level_signal: "",
    headline:
      words === 0
        ? "There's nothing to grade yet: no transcript and a blank canvas."
        : `Only ${plural(words, "word")} and a blank canvas, which isn't enough to grade fairly.`,
    dimensions: [],
    strengths: [],
    top_improvements: [
      {
        issue: "The attempt is too short to evaluate.",
        what_strong_looks_like:
          "Talk through the requirements, a rough estimate, and a first box-and-arrow sketch of the main request path, then submit.",
      },
    ],
    next_drill:
      "Record yourself for at least ten minutes: requirements first, then a quick estimate, then the high-level design on the canvas.",
  };
}
