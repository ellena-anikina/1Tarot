// Перемешивание колоды в браузере: криптостойкий генератор и тасование Фишера–Йетса.

import { REVERSED_PROBABILITY } from "@/config/site";
import type { DrawnCard } from "@/data/types";

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  // отбрасываем «хвост», чтобы распределение было равномерным
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

function randomUnit(): number {
  return randomInt(1_000_000) / 1_000_000;
}

/** Новая перемешанная колода из 78 карт; у каждой — своё положение (прямое или перевёрнутое). */
export function shuffleDeck(): DrawnCard[] {
  const ids = Array.from({ length: 78 }, (_, i) => i);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.map((id) => ({ id, reversed: randomUnit() < REVERSED_PROBABILITY }));
}

/** Случайные позиции веера, ещё не выбранные посетителем. */
export function pickRandomIndexes(total: number, taken: Set<number>, count: number): number[] {
  const free = Array.from({ length: total }, (_, i) => i).filter((i) => !taken.has(i));
  const result: number[] = [];
  while (result.length < count && free.length) {
    result.push(free.splice(randomInt(free.length), 1)[0]);
  }
  return result;
}
