// Расклады: названия позиций, подсказки к ним и порядок выкладки.

export type SpreadId = "one" | "three" | "celtic";

export interface SpreadPosition {
  title: string;
  /** что означает позиция — видно в интерфейсе и уходит в подсказку для ИИ */
  hint: string;
}

export interface Spread {
  id: SpreadId;
  /** классическое название: его видит ИИ, оно же в дневнике */
  name: string;
  /** название в выборе расклада — о чём он, простыми словами */
  title: string;
  /** сколько карт, а для сложных раскладов — и классическое название */
  cardsLabel: string;
  /** одна строка под названием в выборе расклада */
  summary: string;
  /** что даст персональная трактовка — на экране оплаты */
  promise: string;
  positions: SpreadPosition[];
}

export const SPREADS: Record<SpreadId, Spread> = {
  one: {
    id: "one",
    name: "Одна карта",
    title: "Подсказка",
    cardsLabel: "1 карта",
    summary: "Главное, на что стоит обратить внимание",
    promise: "Что эта карта говорит о вашем вопросе и на что стоит обратить внимание сейчас.",
    positions: [{ title: "Подсказка", hint: "главное, на что стоит обратить внимание" }],
  },
  three: {
    id: "three",
    name: "Три карты",
    title: "Разбор ситуации",
    cardsLabel: "3 карты",
    summary: "Суть ситуации, что мешает и что поможет",
    promise: "Как три карты отвечают на ваш вопрос: что происходит на самом деле, что мешает и что поможет.",
    positions: [
      { title: "Суть ситуации", hint: "что происходит на самом деле" },
      { title: "Что мешает", hint: "препятствие или скрытое влияние" },
      { title: "Что поможет", hint: "ресурс и совет" },
    ],
  },
  celtic: {
    id: "celtic",
    name: "Кельтский крест",
    title: "Глубокий разбор",
    cardsLabel: "Кельтский крест, 10 карт",
    summary: "Корни ситуации, надежды и страхи, куда ведёт путь",
    promise: "Подробный разбор десяти позиций: от корня ситуации и скрытых влияний до того, куда ведёт путь.",
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
