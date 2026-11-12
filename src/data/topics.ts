// Готовые темы: клик по теме подставляет открытый вопрос.
// Вопросы сформулированы в духе саморефлексии: «что мне важно понять», «как мне…».

import type { SpreadId } from "./spreads";

export type TopicId = "love" | "relationships" | "money" | "work" | "health" | "growth" | "decision" | "day";

export interface Topic {
  id: TopicId;
  label: string;
  question: string;
  /** какой аспект значения карты подмешивать в базовую трактовку */
  aspect: "love" | "work" | null;
  /** расклад, который логично выбрать вместе с темой */
  spread?: SpreadId;
}

export const TOPICS: Topic[] = [
  { id: "love", label: "Любовь", question: "Что мне важно понять о своей личной жизни сейчас?", aspect: "love" },
  { id: "relationships", label: "Отношения", question: "Что поможет нашим отношениям стать теплее и честнее?", aspect: "love" },
  { id: "money", label: "Деньги", question: "Что поможет мне укрепить финансовое благополучие?", aspect: "work" },
  { id: "work", label: "Работа", question: "Какой следующий шаг в работе будет для меня верным?", aspect: "work" },
  { id: "health", label: "Здоровье", question: "Как мне лучше заботиться о себе в этот период?", aspect: null },
  { id: "growth", label: "Саморазвитие", question: "Что сейчас помогает мне расти, а что тормозит?", aspect: null },
  { id: "decision", label: "Решение", question: "Что мне важно учесть, принимая это решение?", aspect: null },
  { id: "day", label: "Карта дня", question: "На что мне обратить внимание сегодня?", aspect: null, spread: "one" },
];

export const TOPIC_BY_ID: Record<TopicId, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t])) as Record<
  TopicId,
  Topic
>;

export const isTopicId = (v: unknown): v is TopicId => typeof v === "string" && v in TOPIC_BY_ID;
