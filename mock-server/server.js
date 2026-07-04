// mock-server/server.js
const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(cors());
const server = http.createServer(app);

const TYPES = ["image", "audio", "text", "image", "text"]; // 'video' (unknown) appears below
const STATUSES = ["in_progress", "InProgress", "done", "QA", "todo", "BLOCKED"];
const USERS = [
  { id: "u1", name: "Asha" },
  { id: "u2", name: "Ben" },
  { id: "u3", name: "Chen" },
  null, // unassigned happens
];

// deterministic-ish pseudo data (no real randomness needed)
function makeTask(i) {
  const type = i % 11 === 0 ? "video" /* intentionally unknown type */ : TYPES[i % TYPES.length];
  const status = STATUSES[i % STATUSES.length];
  const assignee = USERS[i % USERS.length];
  const useIso = i % 2 === 0;
  const updatedAt = 1719600000000 + i * 37000; // epoch ms
  return {
    id: `t${i}`,
    title: `Task ${i}`,
    type,
    status,                              // inconsistent casing/spelling on purpose
    assignee,                            // sometimes null
    annotationCount: i % 3 === 0 ? String(i) : i,  // sometimes a string on purpose
    updatedAt: useIso ? new Date(updatedAt).toISOString() : updatedAt, // mixed formats
    meta: i % 4 === 0 ? { priority: "high", note: "rush" } : {},       // free-form
  };
}

const ALL = Array.from({ length: 137 }, (_, i) => makeTask(i + 1));

// GET /api/tasks?page=1&pageSize=20&type=&status=  (server-side paginate only)
app.get("/api/tasks", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
  const start = (page - 1) * pageSize;
  const items = ALL.slice(start, start + pageSize);
  // Occasionally the server is slow, simulate it (tests your loading states)
  const delay = page % 3 === 0 ? 1200 : 200;
  setTimeout(() => {
    res.json({ page, pageSize, total: ALL.length, items });
  }, delay);
});

app.get("/api/tasks/:id", (req, res) => {
  const t = ALL.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  res.json(t);
});

// GET /api/tasks/:id/summary  -> streams a markdown summary in chunks (SSE style).
// The content is UNTRUSTED on purpose: it contains raw HTML and a script-like payload.
// Render it as markdown and SANITIZE it. Do not execute the injected HTML/script.
app.get("/api/tasks/:id/summary", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const id = req.params.id;
  const chunks = [
    `## Summary for ${id}\n\n`,
    `This task is **in progress**. Recent activity:\n\n`,
    `- 3 annotations added\n- 1 review pending\n\n`,
    "```ts\nconst score = computeQuality(task); // sample code block\n```\n\n",
    `Reviewer note: looks good, _ship it_.\n\n`,
    // untrusted content starts here, on purpose:
    `<img src=x onerror="alert('xss-img')">\n\n`,
    `<script>alert('xss-script')</script>\n\n`,
    `Done.\n`,
  ];

  let i = 0;
  const timer = setInterval(() => {
    if (i >= chunks.length) {
      res.write("event: done\ndata: end\n\n");
      clearInterval(timer);
      return res.end();
    }
    // SSE frame; data may contain newlines, so encode it
    res.write(`data: ${JSON.stringify(chunks[i])}\n\n`);
    i += 1;
  }, 400);

  req.on("close", () => clearInterval(timer));
});

// WebSocket: emits a live event roughly every 2s
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    const t = ALL[n % ALL.length];
    const kinds = [
      { kind: "task.updated", payload: { id: t.id, status: STATUSES[n % STATUSES.length], updatedAt: Date.now() } },
      { kind: "task.assigned", payload: { id: t.id, assignee: USERS[n % USERS.length] } },
      { kind: "annotation.created", payload: { taskId: t.id, by: "u1", at: Date.now() } },
      // references a task that may be beyond the loaded page, handle it gracefully:
      { kind: "task.updated", payload: { id: `t${120 + (n % 17)}`, status: "done", updatedAt: Date.now() } },
    ];
    ws.send(JSON.stringify(kinds[n % kinds.length]));
  }, 2000);
  ws.on("close", () => clearInterval(timer));
});

server.listen(4000, () => console.log("mock on http://localhost:4000 (ws://localhost:4000/ws)"));
