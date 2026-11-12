// Расклады: названия позиций, подсказки к ним и порядок выкладки.

export type SpreadId = "one" | "three" | "celtic";

export interface SpreadPosition {
  title: string;
  /** что означает позиция — видно в интерфейсе и уходит в подсказку для ИИ */
  hint: string;
}

export interface Spread {
  id: SpreadId;
  name: string;
  /** одна строка под названием в выборе расклада */
  summary: string;
  positions: SpreadPosition[];
}

export const SPREADS: Record<SpreadId, Spread> = {
  one: {
    id: "one",
    name: "Одна карта",
    summary: "Быстрая подсказка на сейчас",
    positions: [{ title: "Подсказка", hint: "главное, на что стоит обратить внимание" }],
  },
  three: {
    id: "three",
    name: "Три карты",
    summary: "Ситуация, препятствие и совет",
    positions: [
      { title: "Суть ситуации", hint: "что происходит на самом деле" },
      { title: "Что мешает", hint: "препятствие или скрытое влияние" },
      { title: "Что поможет", hint: "ресурс и совет" },
    ],
  },
  celtic: {
    id: "celtic",
    name: "Кельтский крест",
    summary: "Подробный разбор из десяти карт",
    positions: [
      { title: "Суть ситуации", hint: "что происходит сейчас" },
      { title: "Препятствие", hint: "что пересекает путь" },
      { title: "Основа", hint: "корень ситуации, глубинные причины" },
      { title: "Уходящее", hint: "что остаётся в прошлом" },
      { title: "Стремление", hint: "сознательная цель, лучший возможный исход" },
      { title: "Ближайшее", hint: "что приближается" },
      { title: "Вы сами", hint: "ваша позиция и настрой" },
      { title: "Окружение", hint: "люди и обстоятельства вокруг" },
      { title: "Надежды и страхи", hint: "чего вы ждёте и чего опасаетесь" },
      { title: "Куда ведёт путь", hint: "вероятное развитие, если ничего не менять" },
    ],
  },
};

export const SPREAD_LIST: Spread[] = [SPREADS.one, SPREADS.three, SPREADS.celtic];

export const isSpreadId = (v: unknown): v is SpreadId => v === "one" || v === "three" || v === "celtic";

/** Склонение: «1 карту», «3 карты», «10 карт». */
export function cardsWord(n: number, forms: [string, string, string] = ["карту", "карты", "карт"]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
