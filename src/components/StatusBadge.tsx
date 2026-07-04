import type { TaskStatus } from "@/types/task";

const COLORS: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  qa: "bg-purple-100 text-purple-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
  unknown: "bg-yellow-100 text-yellow-800",
};

const LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  qa: "QA",
  blocked: "Blocked",
  done: "Done",
  unknown: "Unknown",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
