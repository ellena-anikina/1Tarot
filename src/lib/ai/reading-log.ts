// Журнал раскладов для сравнения моделей: какая модель отвечала, как быстро, сколько токенов
// потратила и что ответила. Пишется только при локальной разработке (npm run dev) — по строке JSON
// на расклад в logs/readings.jsonl. На хостинге не пишется: в журнале вопросы и ответы целиком.

import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CARDS } from "@/data/cards";
import { SPREADS } from "@/data/spreads";
import type { ReadingRequest } from "@/lib/reading-protocol";
import type { AiReady } from "./config";
import type { Attempt, AttemptStats } from "./providers";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "readings.jsonl");

export type ReadingOutcome =
  | "ai" // ответила основная модель
  | "backup" // ответила запасная
  | "interrupted" // ответ оборвался на середине
  | "demo" // не ответил никто — показана базовая трактовка
  | "aborted" // страницу закрыли, не дождавшись ответа
  | "error"; // непредвиденная ошибка на сервере

export interface LoggedAttempt extends AttemptStats {
  /** «Основная модель», «Запасная модель №1»… */
  slot: string;
  provider: string;
  /** адрес API без пути — видно, через какой сервис шёл запрос */
  host?: string;
  model: string;
  ok: boolean;
  /** понятная причина сбоя */
  why?: string;
}

export interface ReadingLogEntry {
  at: string;
  spread: string;
  topic: string | null;
  question: string;
  cards: { position: string; id: number; name: string; reversed: boolean }[];
  /** отпечаток инструкции для модели: если он сменился, ответы до и после сравниваются с оговоркой */
  prompt: string;
  outcome: ReadingOutcome;
  attempts: LoggedAttempt[];
  /** текст ответа модели — без базовой трактовки */
  answer: string;
}

export function newReadingLog(req: ReadingRequest, system: string): ReadingLogEntry {
  const spread = SPREADS[req.spreadId];
  return {
    at: new Date().toISOString(),
    spread: req.spreadId,
    topic: req.topicId,
    question: req.question,
    cards: req.cards.map((c, i) => ({
      position: spread.positions[i].title,
      id: c.id,
      name: CARDS[c.id].name,
      reversed: c.reversed,
    })),
    prompt: createHash("sha256").update(system).digest("hex").slice(0, 8),
    outcome: "aborted",
    attempts: [],
    answer: "",
  };
}

function apiHost(cfg: AiReady): string | undefined {
  const url = cfg.baseURL ?? (cfg.protocol === "anthropic" ? "https://api.anthropic.com" : undefined);
  try {
    return url ? new URL(url).host : undefined;
  } catch {
    return undefined;
  }
}

export function logAttempt(cfg: AiReady, result: Attempt): LoggedAttempt {
  return {
    slot: cfg.title,
    provider: cfg.provider,
    host: apiHost(cfg),
    model: cfg.model,
    ok: result.ok,
    why: result.ok ? undefined : result.why,
    ...result.stats,
  };
}

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
const count = (n: number) => n.toLocaleString("ru-RU");

/** «ответ за 16 с, первые слова через 15 с (до этого размышляла 11,1 с) · токены: 360 на входе, 2 173 на выходе, из них на размышления 1 808» */
export function describeStats({ firstThoughtMs, firstTextMs, totalMs, usage, effort, effortRejected }: AttemptStats): string {
  let time = `ответ за ${seconds(totalMs)}`;
  if (firstTextMs !== null) {
    time += `, первые слова через ${seconds(firstTextMs)}`;
    if (firstThoughtMs !== null && firstTextMs - firstThoughtMs >= 1000) {
      time += ` (до этого размышляла ${seconds(firstTextMs - firstThoughtMs)})`;
    }
  }
  const thinking = usage?.reasoning ? `, из них на размышления ${count(usage.reasoning)}` : "";
  const tokens = usage
    ? `токены: ${count(usage.input)} на входе, ${count(usage.output)} на выходе${thinking}`
    : "токены провайдер не сообщил";
  // Модель просили размышлять (AI_EFFORT), а в ответе этого не видно — глубину не применили провайдер или модель.
  const depth = effortRejected
    ? " · глубину размышлений провайдер не принял"
    : effort && effort !== "low" && firstThoughtMs === null && !usage?.reasoning
      ? " · признаков размышлений нет"
      : "";
  return `${time} · ${tokens}${depth}`;
}

let announced = false;

/** Дописывает расклад в журнал. Ошибка записи не мешает трактовке — только предупреждение в терминале. */
export async function appendReadingLog(entry: ReadingLogEntry): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify({ ...entry, answer: entry.answer || null }) + "\n", "utf8");
    if (!announced) {
      announced = true;
      console.info(`[reading] Расклады записываются в журнал для сравнения моделей: ${LOG_FILE}`);
    }
  } catch (err) {
    console.warn("[reading] Не удалось записать журнал раскладов:", err);
  }
}
