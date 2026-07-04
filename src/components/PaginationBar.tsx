"use client";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectFilters,
  selectFilteredCount,
  selectPageCount,
  setFilters,
} from "@/store/tasksSlice";

export function PaginationBar() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectFilters);
  const pageCount = useAppSelector(selectPageCount);
  const total = useAppSelector(selectFilteredCount);

  if (total === 0) return null;

  const start = (filters.page - 1) * filters.pageSize + 1;
  const end = Math.min(filters.page * filters.pageSize, total);

  return (
    <div className="flex items-center justify-between text-sm text-gray-600">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={filters.page <= 1}
          onClick={() => dispatch(setFilters({ page: filters.page - 1 }))}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {filters.page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={filters.page >= pageCount}
          onClick={() => dispatch(setFilters({ page: filters.page + 1 }))}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
