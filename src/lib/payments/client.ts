// Оплата в браузере: расклады, которые ждут оплаты или уже оплачены, и бесплатный лимит на сегодня.
// Хранится только в этом браузере (localStorage) — так расклад не теряется, пока посетитель
// платит на странице платёжного сервиса или в приложении банка.

import type { DrawnCard } from "@/data/types";
import { isSpreadId, type SpreadId } from "@/data/spreads";
import type { TopicId } from "@/data/topics";
import { FREE_PER_DAY } from "@/config/pricing";

export interface PendingReading {
  orderId: string;
  amount: number;
  question: string;
  topicId: TopicId | null;
  spreadId: SpreadId;
  cards: DrawnCard[];
  createdAt: string;
  /** подтверждение оплаты — появляется, когда платёж прошёл */
  proof?: string;
}

const PENDING_KEY = "tarot.pending.v1";
const PENDING_LIMIT = 5;
/** о неоконченной оплате напоминаем сутки */
const UNPAID_REMIND_MS = 24 * 60 * 60 * 1000;
/** оплаченный расклад ждёт трактовку столько же, сколько действует подтверждение оплаты на сервере */
const PAID_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function isPending(v: unknown): v is PendingReading {
  const p = v as PendingReading;
  return !!p && typeof p.orderId === "string" && isSpreadId(p.spreadId) && Array.isArray(p.cards) && typeof p.createdAt === "string";
}

export function readPending(): PendingReading[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isPending) : [];
  } catch {
    return [];
  }
}

function writePending(list: PendingReading[]): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, PENDING_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function savePending(p: PendingReading): boolean {
  return writePending([p, ...readPending().filter((x) => x.orderId !== p.orderId)]);
}

export function findPending(orderId: string): PendingReading | null {
  return readPending().find((p) => p.orderId === orderId) ?? null;
}

export function removePending(orderId: string): void {
  writePending(readPending().filter((p) => p.orderId !== orderId));
}

/** Что предложить вернуть на главной: сначала оплаченный расклад без трактовки, потом неоконченную оплату. */
export function resumablePending(): PendingReading | null {
  const now = Date.now();
  const fresh = readPending().filter((p) => {
    const age = now - Date.parse(p.createdAt);
    return p.proof ? age < PAID_KEEP_MS : age < UNPAID_REMIND_MS;
  });
  return fresh.find((p) => p.proof) ?? fresh[0] ?? null;
}

// ---------- бесплатный расклад на сегодня ----------

// Подсказка засчитывается в момент, когда уходит запрос трактовки, — а не когда трактовка дописана:
// иначе её можно было бы получать снова и снова, уходя со страницы посреди ответа.
// Если трактовка не пришла по вине сайта (ИИ не ответил, нет связи), подсказка возвращается.
// Лимит хранится в браузере; запасная защита на сервере — не больше FREE_PER_IP_PER_DAY подсказок в день с адреса.

/** ключ в localStorage — по нему вкладки узнают, что лимит изменился в другой вкладке */
export const FREE_KEY = "tarot.free.v1";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Сколько бесплатных раскладов осталось сегодня на этом устройстве. */
export function freeLeftToday(): number {
  try {
    const saved = JSON.parse(localStorage.getItem(FREE_KEY) ?? "null") as { day?: string; used?: number } | null;
    if (saved?.day === today()) return Math.max(0, FREE_PER_DAY - Number(saved.used ?? 0));
  } catch {
    // хранилище недоступно — считаем, что бесплатный расклад есть
  }
  return FREE_PER_DAY;
}

function saveUsed(used: number): number {
  const clamped = Math.min(FREE_PER_DAY, Math.max(0, used));
  try {
    localStorage.setItem(FREE_KEY, JSON.stringify({ day: today(), used: clamped }));
  } catch {
    // не получилось сохранить — лимит в браузере не сработает, останется защита на сервере
  }
  return FREE_PER_DAY - clamped;
}

/** Засчитывает бесплатную подсказку и возвращает, сколько осталось. */
export function spendFreeReading(): number {
  return saveUsed(FREE_PER_DAY - freeLeftToday() + 1);
}

/** Возвращает подсказку: трактовка не пришла по вине сайта. */
export function refundFreeReading(): number {
  return saveUsed(FREE_PER_DAY - freeLeftToday() - 1);
}

/** Сервер сказал, что бесплатные подсказки на сегодня кончились, — запоминаем это и в браузере. */
export function exhaustFreeReadings(): number {
  return saveUsed(FREE_PER_DAY);
}
