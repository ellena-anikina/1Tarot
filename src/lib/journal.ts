// Дневник раскладов: хранится только в браузере посетителя (localStorage), на сервер не уходит.

import type { DrawnCard } from "@/data/types";
import type { SpreadId } from "@/data/spreads";
import type { TopicId } from "@/data/topics";

export interface JournalEntry {
  id: string;
  createdAt: string;
  question: string;
  topicId: TopicId | null;
  spreadId: SpreadId;
  cards: DrawnCard[];
  text: string;
  /** личные мысли посетителя после расклада */
  note?: string;
  /** оплаченный расклад: номер заказа и сумма — пригодятся, если придётся разбираться с оплатой */
  payment?: { orderId: string; amount: number };
}

const KEY = "tarot.journal.v1";
const LIMIT = 200;

export function readJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as JournalEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJournal(entries: JournalEntry[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
    window.dispatchEvent(new Event("journal-change"));
    return true;
  } catch {
    return false;
  }
}

export function addJournalEntry(entry: JournalEntry): boolean {
  return writeJournal([entry, ...readJournal().filter((e) => e.id !== entry.id)]);
}

export function updateJournalNote(id: string, note: string): boolean {
  return writeJournal(readJournal().map((e) => (e.id === id ? { ...e, note } : e)));
}

export function deleteJournalEntry(id: string): boolean {
  return writeJournal(readJournal().filter((e) => e.id !== id));
}

export function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
