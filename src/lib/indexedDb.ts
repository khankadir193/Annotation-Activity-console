import type { Task } from "@/types/task";

/**
 * Thin wrapper around localforage (IndexedDB-backed) for caching the most
 * recently loaded task list. Kept isolated behind this module so the rest of
 * the app never talks to localforage directly, and so tests can mock it
 * without pulling in real IndexedDB.
 *
 * Writes are fire-and-forget from the caller's perspective (we don't await
 * them before updating UI) so a large write never blocks rendering.
 */

const STORE_KEY = "annotation-console:task-cache:v1";

export interface TaskCachePayload {
  tasks: Task[];
  cachedAt: number;
}

let localforageInstance: LocalForage | null = null;

async function getStore(): Promise<LocalForage | null> {
  if (typeof window === "undefined") return null; // SSR guard
  if (localforageInstance) return localforageInstance;
  const localforage = (await import("localforage")).default;
  localforage.config({
    name: "annotation-console",
    storeName: "task_cache",
    driver: localforage.INDEXEDDB,
  });
  localforageInstance = localforage;
  return localforageInstance;
}

export async function saveTaskCache(tasks: Task[]): Promise<void> {
  try {
    const store = await getStore();
    if (!store) return;
    const payload: TaskCachePayload = { tasks, cachedAt: Date.now() };
    await store.setItem(STORE_KEY, payload);
  } catch (err) {
    // Caching is a best-effort optimization; failures shouldn't break the app.
    console.warn("Failed to write task cache to IndexedDB", err);
  }
}

export async function loadTaskCache(): Promise<TaskCachePayload | null> {
  try {
    const store = await getStore();
    if (!store) return null;
    const payload = await store.getItem<TaskCachePayload>(STORE_KEY);
    return payload ?? null;
  } catch (err) {
    console.warn("Failed to read task cache from IndexedDB", err);
    return null;
  }
}
