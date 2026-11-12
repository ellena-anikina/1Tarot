// Минимальный разбор Markdown для трактовки: заголовки ###, абзацы, списки, **жирный**, *курсив*.
// Безопасен (без HTML) и терпим к незаконченному тексту, который ещё «печатается».

import type { ReactNode } from "react";

export type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

export interface Section {
  title: string | null;
  blocks: Block[];
}

export function parseReading(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const ensureSection = () => {
    if (!current) {
      current = { title: null, blocks: [] };
      sections.push(current);
    }
    return current;
  };
  const flush = () => {
    if (paragraph.length) {
      ensureSection().blocks.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
    if (list) {
      ensureSection().blocks.push({ type: "ul", items: list });
      list = null;
    }
  };

  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      current = { title: heading[1].replace(/\*\*/g, "").trim(), blocks: [] };
      sections.push(current);
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      if (paragraph.length) flush();
      (list ??= []).push(item[1]);
      continue;
    }
    if (list) flush();
    paragraph.push(line);
  }
  flush();
  return sections;
}

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    out.push(
      token.startsWith("**") ? (
        <strong key={match.index}>{token.slice(2, -2)}</strong>
      ) : (
        <em key={match.index}>{token.slice(1, -1)}</em>
      )
    );
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function BlockView({ block }: { block: Block }) {
  if (block.type === "ul") {
    return (
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  return <p>{renderInline(block.text)}</p>;
}

/** Текст без разметки — для копирования. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .trim();
}
