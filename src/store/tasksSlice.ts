import {
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { RootState } from "./store";
import type { FeedEvent, Task, TaskStatus, TaskType } from "@/types/task";
import { normalizeTasks } from "@/lib/normalize";
import { fetchTasksPage, ApiError } from "@/lib/api";
import { loadTaskCache, saveTaskCache } from "@/lib/indexedDb";

const tasksAdapter = createEntityAdapter<Task>({
  sortComparer: (a, b) => b.updatedAt - a.updatedAt,
});

export type SortField = "updatedAt" | "annotationCount";
export type SortDir = "asc" | "desc";

export interface Filters {
  type: TaskType | "all";
  status: TaskStatus | "all";
  search: string;
  sortBy: SortField;
  sortDir: SortDir;
  page: number; // client-side pagination over the filtered set, 1-based
  pageSize: number;
}

type LoadStatus = "idle" | "loading" | "loading_more" | "loaded" | "error";

interface TasksState {
  loadStatus: LoadStatus;
  loadError: string | null;
  droppedCount: number; // records normalize.ts couldn't salvage at all
  pagesLoaded: number;
  totalOnServer: number | null;
  filters: Filters;
  selectedTaskId: string | null;
  /** patches for tasks referenced by a feed event before we'd loaded them */
  pendingPatches: Record<string, Partial<Task>>;
  cache: {
    isFromCache: boolean;
    cachedAt: number | null;
    isStale: boolean; // true once we know cached data hasn't been revalidated yet
  };
  wsStatus: "connecting" | "open" | "closed" | "reconnecting";
}

const initialFilters: Filters = {
  type: "all",
  status: "all",
  search: "",
  sortBy: "updatedAt",
  sortDir: "desc",
  page: 1,
  pageSize: 20,
};

const initialState = tasksAdapter.getInitialState<TasksState>({
  loadStatus: "idle",
  loadError: null,
  droppedCount: 0,
  pagesLoaded: 0,
  totalOnServer: null,
  filters: initialFilters,
  selectedTaskId: null,
  pendingPatches: {},
  cache: { isFromCache: false, cachedAt: null, isStale: false },
  wsStatus: "connecting",
});

type TasksSliceState = typeof initialState;

/** Applies a feed event's fields onto a Task in place (used by both the live
 * apply path and the pending-patch replay path). */
function applyEventToTask(task: Task, event: FeedEvent): void {
  if (event.kind === "task.updated") {
    if (typeof event.payload.status === "string") {
      // Reuse the same normalization rules as initial load so live updates
      // can't introduce a status value the rest of the app doesn't expect.
      const key = event.payload.status.trim().toLowerCase().replace(/[\s-]+/g, "_");
      const map: Record<string, TaskStatus> = {
        todo: "todo",
        in_progress: "in_progress",
        inprogress: "in_progress",
        qa: "qa",
        blocked: "blocked",
        done: "done",
        complete: "done",
        completed: "done",
      };
      task.status = map[key] ?? "unknown";
    }
    if (typeof event.payload.updatedAt === "number") {
      task.updatedAt = event.payload.updatedAt;
    }
  } else if (event.kind === "task.assigned") {
    const raw = event.payload.assignee;
    const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (candidate && typeof candidate.id === "string" && typeof candidate.name === "string") {
      task.assignee = { id: candidate.id, name: candidate.name };
    } else {
      task.assignee = null;
    }
  } else if (event.kind === "annotation.created") {
    task.annotationCount += 1;
    if (typeof event.payload.at === "number") {
      task.updatedAt = Math.max(task.updatedAt, event.payload.at);
    }
  }
}

/** Extracts the task id a feed event refers to, regardless of event shape. */
function eventTaskId(event: FeedEvent): string {
  return event.kind === "annotation.created" ? event.payload.taskId : event.payload.id;
}

export const hydrateFromIndexedDb = createAsyncThunk(
  "tasks/hydrateFromIndexedDb",
  async () => {
    const cached = await loadTaskCache();
    return cached;
  }
);

/**
 * Loads the full task list from the mock server, page by page, dispatching
 * as each page arrives so the UI can paint incrementally rather than
 * blocking on all 137 records. Also persists the final merged set to
 * IndexedDB for next time.
 */
export const loadAllTasks = createAsyncThunk<
  void,
  void,
  { state: RootState }
>("tasks/loadAllTasks", async (_, { dispatch, getState }) => {
  const pageSize = 20;
  let page = 1;
  let total = Infinity;

  while ((page - 1) * pageSize < total) {
    const isFirst = page === 1;
    dispatch(tasksSlice.actions.loadStarted({ isFirst }));
    try {
      const res = await fetchTasksPage(page, pageSize);
      total = res.total;
      const { tasks, dropped } = normalizeTasks(res.items);
      dispatch(tasksSlice.actions.pageLoaded({ tasks, dropped, page, total }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unknown error loading tasks";
      dispatch(tasksSlice.actions.loadFailed(message));
      return; // stop paging on failure; user can retry the whole load
    }
    page += 1;
  }

  dispatch(tasksSlice.actions.loadFinished());
  const allTasks = tasksAdapter.getSelectors().selectAll(getState().tasks);
  void saveTaskCache(allTasks); // fire-and-forget, never blocks the UI thread
});

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    loadStarted(state, action: PayloadAction<{ isFirst: boolean }>) {
      state.loadStatus = action.payload.isFirst ? "loading" : "loading_more";
      state.loadError = null;
    },
    pageLoaded(
      state,
      action: PayloadAction<{ tasks: Task[]; dropped: number; page: number; total: number }>
    ) {
      tasksAdapter.upsertMany(state, action.payload.tasks);
      state.droppedCount += action.payload.dropped;
      state.pagesLoaded = Math.max(state.pagesLoaded, action.payload.page);
      state.totalOnServer = action.payload.total;
      state.loadStatus = "loading_more";
      // Replay any patches that arrived for tasks we hadn't loaded yet.
      for (const task of action.payload.tasks) {
        const patch = state.pendingPatches[task.id];
        if (patch) {
          Object.assign(state.entities[task.id]!, patch);
          delete state.pendingPatches[task.id];
        }
      }
    },
    loadFinished(state) {
      state.loadStatus = "loaded";
      state.cache.isStale = false;
    },
    loadFailed(state, action: PayloadAction<string>) {
      state.loadStatus = "error";
      state.loadError = action.payload;
    },
    setFilters(state, action: PayloadAction<Partial<Filters>>) {
      state.filters = { ...state.filters, ...action.payload };
      // Any filter/search/sort change other than page itself resets to page 1.
      if (!("page" in action.payload)) {
        state.filters.page = 1;
      }
    },
    setSelectedTaskId(state, action: PayloadAction<string | null>) {
      state.selectedTaskId = action.payload;
    },
    setWsStatus(state, action: PayloadAction<TasksState["wsStatus"]>) {
      state.wsStatus = action.payload;
    },
    /**
     * Applies one WebSocket feed event. If the referenced task isn't loaded
     * yet (e.g. the mock intentionally emits ids like t121-t137 that may be
     * beyond the first page), we stash the intended change in
     * `pendingPatches` and replay it onto the task the moment it's loaded,
     * instead of dropping the event or crashing.
     */
    applyFeedEvent(state, action: PayloadAction<FeedEvent>) {
      const event = action.payload;
      const id = eventTaskId(event);
      const existing = state.entities[id];
      if (existing) {
        applyEventToTask(existing, event);
      } else {
        const patchTarget: Partial<Task> = { ...(state.pendingPatches[id] ?? {}) };
        applyEventToTask(patchTarget as Task, event);
        state.pendingPatches[id] = patchTarget;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(hydrateFromIndexedDb.fulfilled, (state, action) => {
      if (action.payload) {
        tasksAdapter.setAll(state, action.payload.tasks);
        state.cache = {
          isFromCache: true,
          cachedAt: action.payload.cachedAt,
          isStale: true, // stale until loadAllTasks completes a fresh fetch
        };
      }
    });
  },
});

export const {
  setFilters,
  setSelectedTaskId,
  setWsStatus,
  applyFeedEvent,
} = tasksSlice.actions;

export default tasksSlice.reducer;

// ---- Selectors ----

const adapterSelectors = tasksAdapter.getSelectors<RootState>((state) => state.tasks);

export const selectAllTasks = adapterSelectors.selectAll;
export const selectTaskById = adapterSelectors.selectById;
export const selectTaskEntities = adapterSelectors.selectEntities;
export const selectLoadedCount = adapterSelectors.selectTotal;

export const selectLoadStatus = (state: RootState) => state.tasks.loadStatus;
export const selectLoadError = (state: RootState) => state.tasks.loadError;
export const selectDroppedCount = (state: RootState) => state.tasks.droppedCount;
export const selectTotalOnServer = (state: RootState) => state.tasks.totalOnServer;
export const selectFilters = (state: RootState) => state.tasks.filters;
export const selectSelectedTaskId = (state: RootState) => state.tasks.selectedTaskId;
export const selectCacheMeta = (state: RootState) => state.tasks.cache;
export const selectWsStatus = (state: RootState) => state.tasks.wsStatus;

export const selectSelectedTask = createSelector(
  [selectTaskEntities, selectSelectedTaskId],
  (entities, id) => (id ? entities[id] ?? null : null)
);

/** Applies search + type + status filters, then sorts. Does NOT paginate. */
export const selectFilteredSortedTasks = createSelector(
  [selectAllTasks, selectFilters],
  (tasks, filters) => {
    const search = filters.search.trim().toLowerCase();
    let result = tasks.filter((t) => {
      if (filters.type !== "all" && t.type !== filters.type) return false;
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (search && !t.title.toLowerCase().includes(search) && !t.id.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });
    const dir = filters.sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      const av = filters.sortBy === "updatedAt" ? a.updatedAt : a.annotationCount;
      const bv = filters.sortBy === "updatedAt" ? b.updatedAt : b.annotationCount;
      return (av - bv) * dir;
    });
    return result;
  }
);

export const selectFilteredCount = createSelector(
  [selectFilteredSortedTasks],
  (tasks) => tasks.length
);

export const selectPageCount = createSelector(
  [selectFilteredCount, selectFilters],
  (count, filters) => Math.max(1, Math.ceil(count / filters.pageSize))
);

/** The current page slice of the filtered/sorted view - what the table renders. */
export const selectPagedTasks = createSelector(
  [selectFilteredSortedTasks, selectFilters],
  (tasks, filters) => {
    const start = (filters.page - 1) * filters.pageSize;
    return tasks.slice(start, start + filters.pageSize);
  }
);
