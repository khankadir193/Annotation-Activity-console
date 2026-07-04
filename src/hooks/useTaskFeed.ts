import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/store/hooks";
import { applyFeedEvent, setWsStatus } from "@/store/tasksSlice";
import type { FeedEvent } from "@/types/task";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;

function isFeedEvent(value: unknown): value is FeedEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== "string" || typeof v.payload !== "object" || v.payload === null) {
    return false;
  }
  return (
    v.kind === "task.updated" || v.kind === "task.assigned" || v.kind === "annotation.created"
  );
}

/**
 * Subscribes to the live event WebSocket and dispatches validated events into
 * the tasks slice. Reconnects with exponential backoff (capped) on close or
 * error, and unsubscribes cleanly on unmount so we never leak sockets or
 * reconnect timers across route changes / hot reloads.
 */
export function useTaskFeed(): void {
  const dispatch = useAppDispatch();
  // Track "did the caller unmount us" separately from socket state, so a
  // reconnect timer scheduled just before unmount doesn't fire after.
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function scheduleReconnect() {
      if (unmountedRef.current) return;
      dispatch(setWsStatus("reconnecting"));
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (unmountedRef.current) return;
      dispatch(setWsStatus("connecting"));
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        attempt = 0;
        dispatch(setWsStatus("open"));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          console.warn("useTaskFeed: received non-JSON message, ignoring", event.data);
          return;
        }
        if (!isFeedEvent(parsed)) {
          console.warn("useTaskFeed: received unrecognized event shape, ignoring", parsed);
          return;
        }
        dispatch(applyFeedEvent(parsed));
      };

      socket.onerror = () => {
        // onerror is always followed by onclose in browsers; let onclose
        // own the reconnect decision so we don't double-schedule.
        socket?.close();
      };

      socket.onclose = () => {
        dispatch(setWsStatus("closed"));
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [dispatch]);
}
