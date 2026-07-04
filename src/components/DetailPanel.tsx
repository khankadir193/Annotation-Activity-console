"use client";

import { useAppSelector } from "@/store/hooks";
import { selectSelectedTask } from "@/store/tasksSlice";
import { StatusBadge } from "./StatusBadge";
import { SummaryPanel } from "./SummaryPanel";

export function DetailPanel() {
  const task = useAppSelector(selectSelectedTask);

  if (!task) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        Select a task to see details and its AI summary.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold">{task.title}</h2>
      <p className="text-xs text-gray-400">{task.id}</p>

      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">Type</dt>
        <dd className="capitalize">{task.type}</dd>

        <dt className="text-gray-500">Status</dt>
        <dd>
          <StatusBadge status={task.status} />
        </dd>

        <dt className="text-gray-500">Assignee</dt>
        <dd>{task.assignee ? task.assignee.name : "Unassigned"}</dd>

        <dt className="text-gray-500">Annotations</dt>
        <dd>{task.annotationCount}</dd>

        <dt className="text-gray-500">Updated</dt>
        <dd>{new Date(task.updatedAt).toLocaleString()}</dd>
      </dl>

      {task.hadDataIssues && (
        <div className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
          <p className="font-medium">Data issues auto-corrected on load:</p>
          <ul className="ml-4 list-disc">
            {task.dataIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <SummaryPanel taskId={task.id} />
    </div>
  );
}
