/**
 * Domain types for the annotation console.
 *
 * Design notes (see DECISIONS.md for the full rationale):
 * - `TaskType` is a closed union of the types we know how to render, plus an
 *   explicit `"unknown"` bucket for anything the backend sends that we don't
 *   recognize (e.g. "video" in the mock). We never drop a task just because
 *   its type is unrecognized.
 * - `TaskStatus` is a normalized enum. The backend sends inconsistent
 *   casing/spelling ("InProgress", "QA", "BLOCKED", ...); normalize.ts maps
 *   all known spellings to this enum, and anything it can't recognize maps to
 *   "unknown" rather than throwing.
 * - `Task` is a discriminated union on `type` so that type-specific fields
 *   (if we add them later, e.g. `durationSeconds` for audio) narrow properly.
 *   Today the three known types share the same shape, but keeping the
 *   discriminant in place now means adding type-specific fields later is a
 *   non-breaking change to the union, not a refactor.
 */

export type KnownTaskType = "image" | "audio" | "text";
export type TaskType = KnownTaskType | "unknown";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "qa"
  | "blocked"
  | "done"
  | "unknown";

export interface Assignee {
  id: string;
  name: string;
}

interface BaseTask {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: Assignee | null;
  annotationCount: number;
  updatedAt: number; // always normalized to epoch ms
  meta: Record<string, unknown>;
  /** true if we had to coerce/guess any field on this task from garbage input */
  hadDataIssues: boolean;
  /** human-readable notes about what we couldn't cleanly parse, for debugging/QA */
  dataIssues: string[];
}

export interface ImageTask extends BaseTask {
  type: "image";
}
export interface AudioTask extends BaseTask {
  type: "audio";
}
export interface TextTask extends BaseTask {
  type: "text";
}
export interface UnknownTypeTask extends BaseTask {
  type: "unknown";
  /** the raw, un-normalized type string the backend sent, if any */
  rawType: string | null;
}

export type Task = ImageTask | AudioTask | TextTask | UnknownTypeTask;

/** Shape of a single item as it comes back from GET /api/tasks (messy, untyped). */
export interface RawTaskPayload {
  id: unknown;
  title?: unknown;
  type?: unknown;
  status?: unknown;
  assignee?: unknown;
  annotationCount?: unknown;
  updatedAt?: unknown;
  meta?: unknown;
}

export interface RawTasksResponse {
  page: number;
  pageSize: number;
  total: number;
  items: RawTaskPayload[];
}

/** WebSocket event shapes, per the appendix. */
export interface TaskUpdatedEvent {
  kind: "task.updated";
  payload: { id: string; status?: unknown; updatedAt?: unknown };
}
export interface TaskAssignedEvent {
  kind: "task.assigned";
  payload: { id: string; assignee: unknown };
}
export interface AnnotationCreatedEvent {
  kind: "annotation.created";
  payload: { taskId: string; by: string; at: unknown };
}
export type FeedEvent =
  | TaskUpdatedEvent
  | TaskAssignedEvent
  | AnnotationCreatedEvent;
