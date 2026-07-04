import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import tasksReducer from "@/store/tasksSlice";
import type { Task } from "@/types/task";
import { FiltersBar } from "./FiltersBar";
import { TaskTable } from "./TaskTable";

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

function renderWithStore(tasks: Task[]) {
  const store = configureStore({ reducer: { tasks: tasksReducer } });
  store.dispatch({
    type: "tasks/pageLoaded",
    payload: { tasks, dropped: 0, page: 1, total: tasks.length },
  });
  return render(
    <Provider store={store}>
      <FiltersBar />
      <TaskTable />
    </Provider>
  );
}

describe("TaskTable + FiltersBar integration", () => {
  it("updates the visible rows when the user types in the search box", async () => {
    const user = userEvent.setup();
    renderWithStore([
      makeTask({ id: "t1", title: "Label the cat photo", updatedAt: 3 }),
      makeTask({ id: "t2", title: "Transcribe audio clip", updatedAt: 2 }),
      makeTask({ id: "t3", title: "Review cat video frames", updatedAt: 1 }),
    ]);

    expect(screen.getByText("Label the cat photo")).toBeInTheDocument();
    expect(screen.getByText("Transcribe audio clip")).toBeInTheDocument();
    expect(screen.getByText("Review cat video frames")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search tasks"), "cat");

    expect(screen.getByText("Label the cat photo")).toBeInTheDocument();
    expect(screen.getByText("Review cat video frames")).toBeInTheDocument();
    expect(screen.queryByText("Transcribe audio clip")).not.toBeInTheDocument();
  });

  it("shows an empty state when no task matches the filters", async () => {
    const user = userEvent.setup();
    renderWithStore([makeTask({ id: "t1", title: "Label the cat photo" })]);

    await user.type(screen.getByLabelText("Search tasks"), "zzz-no-match");

    expect(screen.getByText(/No tasks match the current filters/i)).toBeInTheDocument();
  });
});
