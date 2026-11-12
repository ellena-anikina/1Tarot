// Базовая трактовка без ИИ: собирается из описаний карт по правилам.
// Работает в демо-режиме (нет ключа) и как запасной вариант, если модель недоступна.

import { CARDS, type TarotCard } from "@/data/cards";
import { SUITS, type DrawnCard, type Suit } from "@/data/types";
import { SPREADS } from "@/data/spreads";
import { TOPIC_BY_ID } from "@/data/topics";
import type { ReadingRequest } from "@/lib/reading-protocol";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Drawn {
  d: DrawnCard;
  c: TarotCard;
}

const kw = (x: Drawn, n = 2) => (x.d.reversed ? x.c.keywordsReversed : x.c.keywords).slice(0, n).join(" и ");

function cardSection(x: Drawn, index: number, req: ReadingRequest): string {
  const pos = SPREADS[req.spreadId].positions[index];
  const words = (x.d.reversed ? x.c.keywordsReversed : x.c.keywords).slice(0, 3).join(", ");
  const heading = `### ${pos.title} — ${x.c.name}${x.d.reversed ? " (перевёрнутая)" : ""}`;
  const lead = req.spreadId === "one" ? `${cap(words)}.` : `${cap(pos.hint)}: ${words}.`;
  const meaning = x.d.reversed ? x.c.reversed : x.c.upright;
  const topic = req.topicId ? TOPIC_BY_ID[req.topicId] : null;
  const aspectText = !x.d.reversed && topic?.aspect ? x.c[topic.aspect] : "";
  const aspect = aspectText
    ? `${topic?.aspect === "love" ? "В отношениях" : "В делах"}: ${aspectText.charAt(0).toLowerCase()}${aspectText.slice(1)}`
    : "";
  return `${heading}\n\n${[lead, meaning, aspect].filter(Boolean).join(" ")}`;
}

function synthesis(cards: Drawn[], req: ReadingRequest): string {
  const out: string[] = [];
  const n = cards.length;

  if (n === 1) {
    const [x] = cards;
    out.push(
      `${x.c.name} — не приговор, а приглашение посмотреть на ${req.question ? "ваш вопрос" : "происходящее"} через темы: ${(x.d.reversed ? x.c.keywordsReversed : x.c.keywords).join(", ")}.`
    );
    out.push(
      x.d.reversed
        ? "Перевёрнутое положение подсказывает, что энергия карты сейчас скорее обращена внутрь: стоит понять, что её сдерживает."
        : "Прямое положение говорит, что эта энергия доступна вам уже сейчас."
    );
  } else {
    const majors = cards.filter((x) => !x.c.suit).length;
    if (majors / n >= 0.5) {
      out.push(`В раскладе много Старших арканов (${majors} из ${n}): речь о важном жизненном этапе и глубоких процессах, а не о мелочах.`);
    } else if (majors === 0) {
      out.push("В раскладе только Младшие арканы: многое решается повседневными шагами и находится в ваших руках.");
    }

    const counts = new Map<Suit, number>();
    for (const x of cards) if (x.c.suit) counts.set(x.c.suit, (counts.get(x.c.suit) ?? 0) + 1);
    const [topSuit, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (topSuit && topCount && topCount >= (n >= 6 ? 3 : 2)) {
      out.push(`Чаще других выпадают ${SUITS[topSuit].name}: в центре вопроса — ${SUITS[topSuit].theme}.`);
    }

    const reversed = cards.filter((x) => x.d.reversed).length;
    if (reversed === 0) out.push("Все карты легли прямо — энергия ситуации движется свободно.");
    else if (reversed / n >= 0.5) {
      out.push("Много перевёрнутых карт: часть сил сейчас заблокирована или обращена внутрь. Это время скорее для внутренней работы, чем для рывка вперёд.");
    }

    if (req.spreadId === "three") {
      const [a, b, c] = cards;
      out.push(
        `Суть ситуации описывает ${a.c.name}: ${kw(a)}. Препятствие показывает ${b.c.name} — ${kw(b)}. А опорой может стать ${c.c.name}: ${kw(c)}.`
      );
    } else {
      const core = cards[0], root = cards[2], self = cards[6], outcome = cards[9];
      out.push(
        `В основе ситуации лежит ${root.c.name} (${kw(root)}), а её сердцевину показывает ${core.c.name} (${kw(core)}). Если ничего не менять, путь ведёт к карте «${outcome.c.name}»: ${kw(outcome)}. Повлиять на это поможет ваша собственная позиция — ${self.c.name} (${kw(self)}).`
      );
    }
  }

  if (req.topicId === "health") {
    out.push("Карты говорят о самочувствии языком образов: они помогают заметить, чего вам не хватает, но не заменяют врача.");
  }
  return out.join(" ");
}

export function buildDemoReading(req: ReadingRequest): string {
  const cards: Drawn[] = req.cards.map((d) => ({ d, c: CARDS[d.id] }));
  const adviceCard = req.spreadId === "three" ? cards[2] : req.spreadId === "celtic" ? cards[6] : cards[0];

  return [
    ...cards.map((x, i) => cardSection(x, i, req)),
    `### Общая картина\n\n${synthesis(cards, req)}`,
    `### Совет\n\n${adviceCard.c.advice}`,
    `### Вопрос для размышления\n\n${cards[0].c.question}`,
  ].join("\n\n");
}

/** Выдаёт текст небольшими порциями, как это делает настоящая модель. */
export async function* streamDemo(text: string, signal: AbortSignal): AsyncGenerator<string> {
  const tokens = text.match(/\S+\s*/g) ?? [text];
  for (let i = 0; i < tokens.length; i += 2) {
    if (signal.aborted) return;
    yield tokens.slice(i, i + 2).join("");
    await new Promise((r) => setTimeout(r, 16 + Math.random() * 20));
  }
}
