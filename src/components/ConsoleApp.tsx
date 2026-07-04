"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useTaskFeed } from "@/hooks/useTaskFeed";
import {
  hydrateFromIndexedDb,
  loadAllTasks,
  selectCacheMeta,
  selectDroppedCount,
  selectLoadError,
  selectLoadStatus,
  selectLoadedCount,
  selectTotalOnServer,
  selectWsStatus,
} from "@/store/tasksSlice";
import { FiltersBar } from "./FiltersBar";
import { TaskTable } from "./TaskTable";
import { PaginationBar } from "./PaginationBar";
import { DetailPanel } from "./DetailPanel";

export function ConsoleApp() {
  const dispatch = useAppDispatch();
  const loadStatus = useAppSelector(selectLoadStatus);
  const loadError = useAppSelector(selectLoadError);
  const droppedCount = useAppSelector(selectDroppedCount);
  const totalOnServer = useAppSelector(selectTotalOnServer);
  const cache = useAppSelector(selectCacheMeta);
  const wsStatus = useAppSelector(selectWsStatus);
  const loadedCount = useAppSelector(selectLoadedCount);

  useTaskFeed();

  useEffect(() => {
    void dispatch(hydrateFromIndexedDb()).then(() => {
      void dispatch(loadAllTasks());
    });
  }, [dispatch]);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-bold">Annotation Activity Console</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>
            WebSocket:{" "}
            <span
              className={
                wsStatus === "open"
                  ? "text-green-600"
                  : wsStatus === "connecting" || wsStatus === "reconnecting"
                  ? "text-amber-600"
                  : "text-red-600"
              }
            >
              {wsStatus}
            </span>
          </span>
          {cache.isFromCache && (
            <span className={cache.isStale ? "text-amber-600" : "text-green-600"}>
              {cache.isStale ? "Showing cached data — revalidating…" : "Cache revalidated"}
            </span>
          )}
          {(loadStatus === "loading" || loadStatus === "loading_more") && (
            <span>
              Loading tasks… {loadedCount}
              {totalOnServer ? ` / ${totalOnServer}` : ""}
            </span>
          )}
          {loadStatus === "loaded" && (
            <span>
              Loaded {loadedCount} of {totalOnServer ?? loadedCount} tasks
            </span>
          )}
          {droppedCount > 0 && (
            <span className="text-red-600">
              {droppedCount} record{droppedCount === 1 ? "" : "s"} could not be parsed and were
              skipped
            </span>
          )}
        </div>
      </header>

      {loadStatus === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load tasks: {loadError}
          <button
            type="button"
            onClick={() => void dispatch(loadAllTasks())}
            className="ml-3 rounded border border-red-300 px-2 py-1 text-xs hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      <FiltersBar />

      {loadStatus === "idle" && loadedCount === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Preparing…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <TaskTable />
            <PaginationBar />
          </div>
          <div>
            <DetailPanel />
          </div>
        </div>
      )}
    </main>
  );
}
