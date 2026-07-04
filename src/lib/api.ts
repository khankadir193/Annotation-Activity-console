import type { RawTasksResponse } from "@/types/task";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetches one page of tasks. Throws ApiError on non-2xx or network failure;
 * the caller (thunk) is responsible for turning that into slice error state.
 * We intentionally do NOT trust the response shape here - normalize.ts does
 * the real validation. This function only guarantees "we got JSON back".
 */
export async function fetchTasksPage(
  page: number,
  pageSize = 20
): Promise<RawTasksResponse> {
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/api/tasks?page=${page}&pageSize=${pageSize}`
    );
  } catch (err) {
    throw new ApiError(
      `Network error fetching tasks page ${page}: ${(err as Error).message}`
    );
  }
  if (!res.ok) {
    throw new ApiError(`Failed to fetch tasks page ${page}`, res.status);
  }
  const data = (await res.json()) as unknown;
  // Minimal shape guard; deep validation happens per-item in normalize.ts.
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as RawTasksResponse).items)
  ) {
    throw new ApiError(`Malformed response for tasks page ${page}`);
  }
  return data as RawTasksResponse;
}
