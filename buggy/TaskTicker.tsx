// buggy/TaskTicker.tsx
//
// Fixed version. See DECISIONS.md "Part 2: Bug hunt" for the root-cause
// writeup of each numbered fix below.
import React, { useEffect, useMemo, useState } from "react";

type Task = { id: string; title: string; updatedAt: number };

export function TaskTicker({ apiBase }: { apiBase: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // (A) keep a running clock for "x seconds ago"
  // FIX: use the functional updater form. The effect's dependency array is
  // `[]`, so the closure captured `tick` at its initial value (0) forever;
  // every tick was `setTick(0 + 1)`, so the counter never advanced past 1.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // (B) refetch whenever selection changes
  // FIX (two bugs here):
  //   1. There was no guard for `selectedId === null`, so this fired on
  //      mount and requested `/api/tasks/null`.
  //   2. `prev.push(t)` mutates the existing state array and returns the
  //      same reference `prev`, which is a state-mutation bug: React may
  //      not see it as a real change (breaking updates), and re-selecting
  //      the same task appends a second, duplicate entry for the same id
  //      instead of replacing/refreshing it.
  // The fix fetches only when there's a real id, and returns a new array
  // that upserts by id instead of always appending.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`${apiBase}/api/tasks/${selectedId}`)
      .then((r) => r.json())
      .then((t: Task) => {
        if (cancelled) return;
        setTasks((prev) => {
          const withoutExisting = prev.filter((existing) => existing.id !== t.id);
          return [...withoutExisting, t];
        });
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, selectedId]);

  // (C) newest first
  // FIX: `Array.prototype.sort` mutates in place. Calling it directly on
  // `tasks` during render mutates state outside of setState, which is a
  // React anti-pattern (state changes should be immutable) and, because it
  // ran on every render, did unnecessary work and could reorder the array
  // out from under anything else still referencing the old `tasks` value.
  // `useMemo` over a copy makes this a pure, non-mutating derivation.
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks]
  );

  return (
    <ul>
      {sorted.map((t) => (
        // (D) FIX: keyed by array index, not by the task's stable id. Since
        // the list re-sorts and can be updated in place, an index key tells
        // React the wrong element identity across reorders, causing it to
        // reuse/misapply DOM nodes (and any local state) for the wrong task.
        <li key={t.id} onClick={() => setSelectedId(t.id)}>
          {t.title} (updated {Math.floor((Date.now() - t.updatedAt) / 1000)}s ago)
        </li>
      ))}
    </ul>
  );
}
