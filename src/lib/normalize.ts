import type {
  Assignee,
  KnownTaskType,
  RawTaskPayload,
  Task,
  TaskStatus,
} from "@/types/task";

const KNOWN_TYPES: readonly KnownTaskType[] = ["image", "audio", "text"];

/**
 * Maps every casing/spelling variant we've seen (or can reasonably expect)
 * to a normalized status. Anything not in this table becomes "unknown" -
 * we never throw on a status we don't recognize.
 */
const STATUS_MAP: Record<string, TaskStatus> = {
  todo: "todo",
  "to_do": "todo",
  in_progress: "in_progress",
  inprogress: "in_progress",
  qa: "qa",
  blocked: "blocked",
  done: "done",
  complete: "done",
  completed: "done",
};

function normalizeStatus(raw: unknown): { status: TaskStatus; issue?: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { status: "unknown", issue: `missing/invalid status: ${JSON.stringify(raw)}` };
  }
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const mapped = STATUS_MAP[key];
  if (mapped) return { status: mapped };
  return { status: "unknown", issue: `unrecognized status: "${raw}"` };
}

function normalizeType(raw: unknown): { type: KnownTaskType | "unknown"; rawType: string | null; issue?: string } {
  if (typeof raw === "string" && (KNOWN_TYPES as readonly string[]).includes(raw)) {
    return { type: raw as KnownTaskType, rawType: raw };
  }
  return {
    type: "unknown",
    rawType: typeof raw === "string" ? raw : null,
    issue: `unrecognized task type: ${JSON.stringify(raw)}`,
  };
}

/**
 * Accepts epoch-ms numbers, numeric strings, or ISO date strings.
 * Falls back to Date.now() (flagged as an issue) rather than producing NaN,
 * since NaN would silently break every sort-by-updatedAt.
 */
function normalizeTimestamp(raw: unknown): { updatedAt: number; issue?: string } {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { updatedAt: raw };
  }
  if (typeof raw === "string") {
    // numeric string, e.g. "1719600000000"
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (Number.isFinite(n)) return { updatedAt: n };
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return { updatedAt: parsed };
  }
  return { updatedAt: Date.now(), issue: `unparseable timestamp, defaulted to now: ${JSON.stringify(raw)}` };
}

function normalizeAssignee(raw: unknown): { assignee: Assignee | null; issue?: string } {
  if (raw === null || raw === undefined) return { assignee: null };
  if (
    typeof raw === "object" &&
    raw !== null &&
    "id" in raw &&
    "name" in raw &&
    typeof (raw as Record<string, unknown>).id === "string" &&
    typeof (raw as Record<string, unknown>).name === "string"
  ) {
    const r = raw as { id: string; name: string };
    return { assignee: { id: r.id, name: r.name } };
  }
  return { assignee: null, issue: `unrecognized assignee shape, treated as unassigned: ${JSON.stringify(raw)}` };
}

/**
 * annotationCount sometimes arrives as a numeric string ("12") instead of a
 * number. Coerce it; if it's neither, default to 0 and flag it rather than
 * propagating NaN into sorts/aggregations.
 */
function normalizeAnnotationCount(raw: unknown): { annotationCount: number; issue?: string } {
  if (typeof raw === "number" && Number.isFinite(raw)) return { annotationCount: raw };
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
    return { annotationCount: Number(raw) };
  }
  return { annotationCount: 0, issue: `unparseable annotationCount, defaulted to 0: ${JSON.stringify(raw)}` };
}

function normalizeMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Normalizes one raw task payload into our internal Task model.
 * Never throws, never drops the task: if `id` itself is missing/invalid we
 * still can't produce a usable Task (there's nothing to key it by), so that
 * one case returns null and the caller is responsible for logging/dropping
 * it. Every other field defect is coerced to a safe default and recorded in
 * `dataIssues` instead of losing the record.
 */
export function normalizeTask(raw: RawTaskPayload): Task | null {
  if (typeof raw?.id !== "string" || raw.id.trim() === "") {
    return null; // no stable identity to key state/selectors/React lists by
  }

  const issues: string[] = [];

  const title =
    typeof raw.title === "string" && raw.title.trim() !== "" ? raw.title : `Untitled (${raw.id})`;
  if (title.startsWith("Untitled")) issues.push("missing/invalid title");

  const { type, rawType, issue: typeIssue } = normalizeType(raw.type);
  if (typeIssue) issues.push(typeIssue);

  const { status, issue: statusIssue } = normalizeStatus(raw.status);
  if (statusIssue) issues.push(statusIssue);

  const { assignee, issue: assigneeIssue } = normalizeAssignee(raw.assignee);
  if (assigneeIssue) issues.push(assigneeIssue);

  const { annotationCount, issue: countIssue } = normalizeAnnotationCount(raw.annotationCount);
  if (countIssue) issues.push(countIssue);

  const { updatedAt, issue: tsIssue } = normalizeTimestamp(raw.updatedAt);
  if (tsIssue) issues.push(tsIssue);

  const meta = normalizeMeta(raw.meta);

  const base = {
    id: raw.id,
    title,
    status,
    assignee,
    annotationCount,
    updatedAt,
    meta,
    hadDataIssues: issues.length > 0,
    dataIssues: issues,
  };

  if (type === "unknown") {
    return { ...base, type: "unknown", rawType };
  }
  return { ...base, type };
}

export interface NormalizeResult {
  tasks: Task[];
  /** ids (or best-effort index) of raw records that were dropped entirely */
  dropped: number;
}

/** Normalizes a full page of raw payloads, dropping only records with no usable id. */
export function normalizeTasks(rawItems: RawTaskPayload[]): NormalizeResult {
  const tasks: Task[] = [];
  let dropped = 0;
  for (const raw of rawItems) {
    const t = normalizeTask(raw);
    if (t) tasks.push(t);
    else dropped += 1;
  }
  return { tasks, dropped };
}
