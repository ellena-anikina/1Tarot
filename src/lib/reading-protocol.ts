// Общий «контракт» между страницей и сервером: что отправляем и что получаем.

import type { DrawnCard } from "@/data/types";
import { SPREADS, cardsWord, isSpreadId, type SpreadId } from "@/data/spreads";
import { isTopicId, type TopicId } from "@/data/topics";

export const QUESTION_MAX_LENGTH = 400;

export interface ReadingRequest {
  question: string;
  topicId: TopicId | null;
  spreadId: SpreadId;
  cards: DrawnCard[];
}

/**
 * Сервер отвечает потоком строк NDJSON — по одному событию на строку.
 * Так страница узнаёт о переключении на базовую трактовку даже посреди ответа.
 */
export type ReadingEvent =
  | { type: "meta"; mode: "ai" | "demo"; detail?: string }
  | { type: "text"; text: string }
  | { type: "notice"; text: string }
  | { type: "done" }
  | { type: "error"; text: string };

export function parseReadingRequest(body: unknown): { ok: true; value: ReadingRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Пустой запрос" };
  const b = body as Record<string, unknown>;

  const question = typeof b.question === "string" ? b.question.trim().slice(0, QUESTION_MAX_LENGTH) : "";
  const topicId = isTopicId(b.topicId) ? b.topicId : null;
  if (!isSpreadId(b.spreadId)) return { ok: false, error: "Неизвестный расклад" };
  const spreadId = b.spreadId;

  if (!Array.isArray(b.cards)) return { ok: false, error: "Нет карт" };
  const expected = SPREADS[spreadId].positions.length;
  if (b.cards.length !== expected) {
    return { ok: false, error: `Для этого расклада нужно выбрать ${expected} ${cardsWord(expected)}` };
  }

  const seen = new Set<number>();
  const cards: DrawnCard[] = [];
  for (const raw of b.cards) {
    const c = raw as Record<string, unknown>;
    const id = Number(c?.id);
    if (!Number.isInteger(id) || id < 0 || id > 77 || seen.has(id)) return { ok: false, error: "Некорректная карта" };
    seen.add(id);
    cards.push({ id, reversed: c.reversed === true });
  }
  return { ok: true, value: { question, topicId, spreadId, cards } };
}
