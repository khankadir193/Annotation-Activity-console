"use client";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectPagedTasks,
  selectSelectedTaskId,
  setSelectedTaskId,
} from "@/store/tasksSlice";
import { StatusBadge } from "./StatusBadge";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function TaskTable() {
  const tasks = useAppSelector(selectPagedTasks);
  const selectedId = useAppSelector(selectSelectedTaskId);
  const dispatch = useAppDispatch();

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        No tasks match the current filters.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500">
          <th className="py-2 pr-2">Title</th>
          <th className="py-2 pr-2">Type</th>
          <th className="py-2 pr-2">Status</th>
          <th className="py-2 pr-2">Assignee</th>
          <th className="py-2 pr-2">Annotations</th>
          <th className="py-2 pr-2">Updated</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr
            key={t.id}
            onClick={() => dispatch(setSelectedTaskId(t.id))}
            aria-selected={t.id === selectedId}
            className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
              t.id === selectedId ? "bg-blue-50" : ""
            }`}
          >
            <td className="py-2 pr-2">
              {t.title}
              {t.hadDataIssues && (
                <span
                  title={t.dataIssues.join("; ")}
                  className="ml-1 text-amber-500"
                  aria-label="This task had data issues that were auto-corrected"
                >
                  ⚠
                </span>
              )}
            </td>
            <td className="py-2 pr-2 capitalize">{t.type}</td>
            <td className="py-2 pr-2">
              <StatusBadge status={t.status} />
            </td>
            <td className="py-2 pr-2">{t.assignee ? t.assignee.name : "Unassigned"}</td>
            <td className="py-2 pr-2">{t.annotationCount}</td>
            <td className="py-2 pr-2 text-gray-500">{formatTime(t.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
