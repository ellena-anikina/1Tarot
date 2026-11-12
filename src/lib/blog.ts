// Блог: статьи лежат в content/blog/*.md (Markdown с шапкой-frontmatter).
// Чтобы добавить статью, создайте новый .md-файл по образцу существующих — сайт подхватит его сам.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  /** дата публикации, ГГГГ-ММ-ДД */
  date: string;
  updated?: string;
  keywords: string[];
  readingMinutes: number;
}

export interface Post extends PostMeta {
  html: string;
}

const DIR = path.join(process.cwd(), "content", "blog");

function load(file: string): Post {
  const slug = file.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(DIR, file), "utf8");
  const { data, content } = matter(raw);
  const words = content.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ""),
    date: data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? ""),
    updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : data.updated ? String(data.updated) : undefined,
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    readingMinutes: Math.max(1, Math.round(words / 170)),
    html: marked.parse(content, { async: false }) as string,
  };
}

let cache: Post[] | null = null;

function all(): Post[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".md")) : [];
  cache = files.map(load).sort((a, b) => (a.date < b.date ? 1 : -1));
  return cache;
}

export function getAllPosts(): PostMeta[] {
  return all().map(({ html: _html, ...meta }) => meta);
}

export function getPost(slug: string): Post | null {
  return all().find((p) => p.slug === slug) ?? null;
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
