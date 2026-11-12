// Полная колода: справочник (deck.json) + значения карт (meanings/*).
// Используется только на сервере: страницы карт, демо-трактовка, подсказка для ИИ.
// В браузер уходит облегчённая версия — см. toLiteCard().

import deck from "./deck.json";
import { MAJOR } from "./meanings/major";
import { WANDS } from "./meanings/wands";
import { CUPS } from "./meanings/cups";
import { SWORDS } from "./meanings/swords";
import { PENTACLES } from "./meanings/pentacles";
import type { LiteCard, Suit } from "./types";

export interface CardMeaning {
  /** ключевые слова в прямом положении */
  keywords: string[];
  /** ключевые слова в перевёрнутом положении */
  keywordsReversed: string[];
  /** что изображено на карте */
  scene: string;
  /** значение в прямом положении */
  upright: string;
  /** значение в перевёрнутом положении */
  reversed: string;
  /** в любви и отношениях */
  love: string;
  /** в работе и финансах */
  work: string;
  /** совет карты — одна фраза */
  advice: string;
  /** вопрос для размышления */
  question: string;
}

interface DeckEntry {
  id: number;
  slug: string;
  name: string;
  nameEn: string;
  suit: Suit | null;
  rank: number;
  numeral: string | null;
  source: string;
}

export interface TarotCard extends DeckEntry, CardMeaning {
  arcana: "major" | "minor";
}

const meanings: CardMeaning[] = [...MAJOR, ...WANDS, ...CUPS, ...SWORDS, ...PENTACLES];

export const CARDS: TarotCard[] = (deck as DeckEntry[]).map((entry, i) => {
  const meaning = meanings[i];
  if (!meaning) throw new Error(`Нет описания для карты «${entry.name}»`);
  return { ...entry, ...meaning, arcana: entry.suit ? "minor" : "major" };
});

if (CARDS.length !== 78) throw new Error(`В колоде должно быть 78 карт, а не ${CARDS.length}`);

export const cardById = (id: number): TarotCard | undefined => CARDS[id];
export const cardBySlug = (slug: string): TarotCard | undefined => CARDS.find((c) => c.slug === slug);

export function toLiteCard(card: TarotCard): LiteCard {
  return {
    id: card.id,
    slug: card.slug,
    name: card.name,
    suit: card.suit,
    keywords: card.keywords,
    keywordsReversed: card.keywordsReversed,
    advice: card.advice,
  };
}

export const LITE_DECK: LiteCard[] = CARDS.map(toLiteCard);
