import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

export type SummaryStreamStatus = "idle" | "streaming" | "done" | "error";

export interface SummaryStreamState {
  content: string;
  status: SummaryStreamStatus;
  error: string | null;
}

/**
 * Streams the markdown summary for `taskId` from the mock server's SSE
 * endpoint, appending chunks as they arrive so the caller can render
 * incrementally. Switching `taskId` (including to null) tears down the
 * previous EventSource immediately, so a slow/old stream can never write
 * into the wrong task's state after the user has already moved on.
 *
 * IMPORTANT (security): the returned `content` is raw, untrusted markdown
 * straight from the server - it is NOT sanitized here. Sanitization happens
 * exactly once, at render time, in <SummaryPanel /> via rehype-sanitize.
 * This hook only accumulates text; it never touches the DOM.
 */
export function useTaskSummaryStream(taskId: string | null): SummaryStreamState {
  const [state, setState] = useState<SummaryStreamState>({
    content: "",
    status: "idle",
    error: null,
  });

  // Guards against a just-closed stream's late event handlers touching state
  // for a task the user has already navigated away from.
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setState({ content: "", status: "idle", error: null });
      return;
    }

    activeIdRef.current = taskId;
    setState({ content: "", status: "streaming", error: null });

    const source = new EventSource(`${API_BASE}/api/tasks/${taskId}/summary`);

    source.onmessage = (event: MessageEvent<string>) => {
      if (activeIdRef.current !== taskId) return;
      try {
        const chunk: unknown = JSON.parse(event.data);
        if (typeof chunk === "string") {
          setState((prev) => ({ ...prev, content: prev.content + chunk }));
        }
      } catch {
        // Malformed frame; skip it rather than crash the stream.
      }
    };

    source.addEventListener("done", () => {
      if (activeIdRef.current !== taskId) return;
      setState((prev) => ({ ...prev, status: "done" }));
      source.close();
    });

    source.onerror = () => {
      if (activeIdRef.current !== taskId) return;
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "Lost connection to the summary stream.",
      }));
      source.close();
    };

    return () => {
      // Switching tasks (or unmounting) mid-stream: stop listening and close
      // the connection so the old stream can't append to the new task's view.
      if (activeIdRef.current === taskId) {
        activeIdRef.current = null;
      }
      source.close();
    };
  }, [taskId]);

  return state;
}
