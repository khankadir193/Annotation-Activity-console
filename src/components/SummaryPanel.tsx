"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useTaskSummaryStream } from "@/hooks/useTaskSummaryStream";

/**
 * SANITIZATION, explained (see DECISIONS.md for the full writeup):
 *
 * The mock server's summary stream is untrusted: it contains raw HTML
 * (`<img onerror=...>`) and a `<script>` tag on purpose. We render the
 * stream as markdown, so we need an HTML parsing step for things like the
 * fenced code block *and* the deliberately-injected raw HTML to both turn
 * into a DOM - but we never want the injected HTML to execute.
 *
 * Pipeline: remark (markdown -> mdast) -> rehypeRaw (parses raw HTML
 * embedded in the markdown into hast, but does NOT execute it - it's just a
 * tree at this point) -> rehypeSanitize (strips any tag/attribute not on the
 * allowlist - this is the actual security boundary: script tags are removed
 * entirely, and event-handler attributes like onerror/onclick are stripped
 * from every element) -> react-markdown's renderer (turns sanitized hast
 * into React elements, never dangerouslySetInnerHTML).
 *
 * We extend the default (github-flavored) sanitize schema to explicitly
 * drop <script> and <style> and to explicitly deny any `on*` attribute,
 * even though the default schema already excludes them - the explicit
 * denylist here is so this stays enforced even if the default schema
 * changes upstream.
 */
type AttrEntry = NonNullable<typeof defaultSchema.attributes>[string][number];

function isEventHandlerAttr(entry: AttrEntry): boolean {
  const name = typeof entry === "string" ? entry : entry[0];
  return name.startsWith("on");
}

const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== "script" && t !== "style"),
  attributes: {
    ...defaultSchema.attributes,
    "*": (defaultSchema.attributes?.["*"] ?? []).filter((attr) => !isEventHandlerAttr(attr)),
  },
};

export function SummaryPanel({ taskId }: { taskId: string | null }) {
  const { content, status, error } = useTaskSummaryStream(taskId);

  if (!taskId) return null;

  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">AI Summary</h3>
        {status === "streaming" && (
          <span className="text-xs text-gray-400">streaming…</span>
        )}
        {status === "done" && <span className="text-xs text-green-600">done</span>}
        {status === "error" && <span className="text-xs text-red-600">error</span>}
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600">{error ?? "Something went wrong."}</p>
      )}

      {content.length === 0 && status === "streaming" && (
        <p className="text-sm text-gray-400">Waiting for the first chunk…</p>
      )}

      <div className="markdown-body prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
