import { normalizeTask, normalizeTasks } from "./normalize";
import type { RawTaskPayload } from "@/types/task";

describe("normalizeTask", () => {
  it("normalizes inconsistent status casing/spelling", () => {
    expect(normalizeTask({ id: "t1", status: "InProgress" } as RawTaskPayload)?.status).toBe(
      "in_progress"
    );
    expect(normalizeTask({ id: "t2", status: "QA" } as RawTaskPayload)?.status).toBe("qa");
    expect(normalizeTask({ id: "t3", status: "BLOCKED" } as RawTaskPayload)?.status).toBe(
      "blocked"
    );
    expect(normalizeTask({ id: "t4", status: "todo" } as RawTaskPayload)?.status).toBe("todo");
  });

  it("maps an unrecognized status to 'unknown' and records the issue instead of throwing", () => {
    const task = normalizeTask({ id: "t5", status: "banana" } as RawTaskPayload);
    expect(task?.status).toBe("unknown");
    expect(task?.hadDataIssues).toBe(true);
    expect(task?.dataIssues.some((i) => i.includes("banana"))).toBe(true);
  });

  it("buckets unrecognized task types into 'unknown' without dropping the record", () => {
    const task = normalizeTask({ id: "t6", type: "video" } as RawTaskPayload);
    expect(task?.type).toBe("unknown");
    if (task?.type === "unknown") {
      expect(task.rawType).toBe("video");
    }
  });

  it("accepts epoch-ms numbers and ISO strings for updatedAt", () => {
    const iso = normalizeTask({ id: "t7", updatedAt: "2024-06-28T16:00:00.000Z" } as RawTaskPayload);
    const epoch = normalizeTask({ id: "t8", updatedAt: 1719590400000 } as RawTaskPayload);
    expect(iso?.updatedAt).toBe(Date.parse("2024-06-28T16:00:00.000Z"));
    expect(epoch?.updatedAt).toBe(1719590400000);
  });

  it("coerces a numeric-string annotationCount to a number", () => {
    const task = normalizeTask({ id: "t9", annotationCount: "12" } as RawTaskPayload);
    expect(task?.annotationCount).toBe(12);
    expect(typeof task?.annotationCount).toBe("number");
  });

  it("treats a null assignee as unassigned", () => {
    const task = normalizeTask({ id: "t10", assignee: null } as RawTaskPayload);
    expect(task?.assignee).toBeNull();
  });

  it("returns null (drops) only when there is no usable id", () => {
    expect(normalizeTask({ id: "" } as RawTaskPayload)).toBeNull();
    expect(normalizeTask({ id: undefined } as unknown as RawTaskPayload)).toBeNull();
  });

  it("never throws on a garbage payload", () => {
    expect(() =>
      normalizeTask({
        id: "t11",
        type: 42,
        status: { weird: true },
        assignee: "not-an-object",
        annotationCount: {},
        updatedAt: "not a date",
        meta: "also not an object",
      } as unknown as RawTaskPayload)
    ).not.toThrow();
  });
});

describe("normalizeTasks", () => {
  it("keeps valid records and drops only ones with no usable id", () => {
    const { tasks, dropped } = normalizeTasks([
      { id: "a", status: "done" } as RawTaskPayload,
      { id: "" } as RawTaskPayload,
      { id: "b", status: "todo" } as RawTaskPayload,
    ]);
    expect(tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(dropped).toBe(1);
  });
});
