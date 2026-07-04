import { configureStore } from "@reduxjs/toolkit";
import tasksReducer, {
  selectFilteredSortedTasks,
  setFilters,
} from "./tasksSlice";
import type { Task } from "@/types/task";
import type { RootState } from "./store";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: `Task ${overrides.id}`,
    type: "image",
    status: "todo",
    assignee: null,
    annotationCount: 0,
    updatedAt: 0,
    meta: {},
    hadDataIssues: false,
    dataIssues: [],
    ...overrides,
  } as Task;
}

function buildStore(tasks: Task[]) {
  const store = configureStore({ reducer: { tasks: tasksReducer } });
  // Seed state directly via the internal action shape used by the slice.
  store.dispatch({
    type: "tasks/pageLoaded",
    payload: { tasks, dropped: 0, page: 1, total: tasks.length },
  });
  return store;
}

describe("selectFilteredSortedTasks", () => {
  it("filters by type and status and sorts by updatedAt desc by default", () => {
    const tasks = [
      makeTask({ id: "a", type: "image", status: "done", updatedAt: 100 }),
      makeTask({ id: "b", type: "audio", status: "todo", updatedAt: 300 }),
      makeTask({ id: "c", type: "image", status: "todo", updatedAt: 200 }),
    ];
    const store = buildStore(tasks);

    const state = store.getState() as RootState;
    const result = selectFilteredSortedTasks(state);
    expect(result.map((t) => t.id)).toEqual(["b", "c", "a"]); // sorted desc by updatedAt

    store.dispatch(setFilters({ type: "image" }));
    const filtered = selectFilteredSortedTasks(store.getState() as RootState);
    expect(filtered.map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("filters by search across title and id, case-insensitively", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Label the cat photo", updatedAt: 1 }),
      makeTask({ id: "t2", title: "Transcribe audio clip", updatedAt: 2 }),
    ];
    const store = buildStore(tasks);
    store.dispatch(setFilters({ search: "CAT" }));
    const result = selectFilteredSortedTasks(store.getState() as RootState);
    expect(result.map((t) => t.id)).toEqual(["t1"]);
  });
});
