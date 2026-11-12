// Общие типы, которые нужны и серверу, и браузеру.

export type Suit = "wands" | "cups" | "swords" | "pentacles";

/** Облегчённая карта для интерфейса расклада (без длинных текстов). */
export interface LiteCard {
  id: number;
  slug: string;
  name: string;
  suit: Suit | null;
  keywords: string[];
  keywordsReversed: string[];
  advice: string;
}

/** Карта, вытянутая в раскладе. */
export interface DrawnCard {
  id: number;
  reversed: boolean;
}

export const SUITS: Record<Suit, { name: string; genitive: string; element: string; theme: string }> = {
  wands: { name: "Жезлы", genitive: "Жезлов", element: "Огонь", theme: "энергия, страсть, действие и творчество" },
  cups: { name: "Кубки", genitive: "Кубков", element: "Вода", theme: "чувства, отношения и интуиция" },
  swords: { name: "Мечи", genitive: "Мечей", element: "Воздух", theme: "мысли, решения, правда и конфликты" },
  pentacles: { name: "Пентакли", genitive: "Пентаклей", element: "Земля", theme: "деньги, работа, тело и быт" },
};

/** Путь к изображению карты. 320 — для раскладов и списков, 640 — для крупного показа. */
export const cardImage = (slug: string, size: 320 | 640 = 320) => `/cards/${size}/${slug}.webp`;

/** Пропорции иллюстрации (ширина / высота) после обработки сканов. */
export const CARD_ART_RATIO = 640 / 1054;
