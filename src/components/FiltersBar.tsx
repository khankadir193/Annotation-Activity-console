"use client";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectFilters, setFilters } from "@/store/tasksSlice";
import type { TaskStatus, TaskType } from "@/types/task";

const TYPE_OPTIONS: Array<TaskType | "all"> = ["all", "image", "audio", "text", "unknown"];
const STATUS_OPTIONS: Array<TaskStatus | "all"> = [
  "all",
  "todo",
  "in_progress",
  "qa",
  "blocked",
  "done",
  "unknown",
];

export function FiltersBar() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectFilters);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white p-3">
      <input
        type="text"
        placeholder="Search title or id…"
        value={filters.search}
        onChange={(e) => dispatch(setFilters({ search: e.target.value }))}
        className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
        aria-label="Search tasks"
      />

      <label className="flex items-center gap-1 text-sm">
        Type
        <select
          value={filters.type}
          onChange={(e) => dispatch(setFilters({ type: e.target.value as TaskType | "all" }))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-sm">
        Status
        <select
          value={filters.status}
          onChange={(e) => dispatch(setFilters({ status: e.target.value as TaskStatus | "all" }))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-sm">
        Sort by
        <select
          value={filters.sortBy}
          onChange={(e) =>
            dispatch(setFilters({ sortBy: e.target.value as "updatedAt" | "annotationCount" }))
          }
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="updatedAt">Updated</option>
          <option value="annotationCount">Annotation count</option>
        </select>
      </label>

      <button
        type="button"
        onClick={() =>
          dispatch(setFilters({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" }))
        }
        className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
        aria-label="Toggle sort direction"
      >
        {filters.sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
      </button>
    </div>
  );
}
