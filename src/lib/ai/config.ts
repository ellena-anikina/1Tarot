// Читает настройки ИИ из .env.local и решает, в каком режиме работать.
// Основная модель — переменные AI_*, запасные — AI_*_2 и AI_*_3. Если основная не ответила,
// по очереди пробуются запасные. Нет ни одного ключа → демо-режим: трактовка собирается
// из описаний карт, сайт полностью работает.

type Protocol = "anthropic" | "openai";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

interface Preset {
  label: string;
  protocol: Protocol;
  baseURL?: string;
  defaultModel?: string;
  needsKey: boolean;
}

/** Готовые настройки популярных провайдеров. Всё, кроме Anthropic, — через OpenAI-совместимый API. */
const PRESETS: Record<string, Preset> = {
  anthropic: { label: "Anthropic (Claude)", protocol: "anthropic", defaultModel: "claude-opus-5-5", needsKey: true },
  openai: { label: "OpenAI", protocol: "openai", baseURL: "https://api.openai.com/v1", defaultModel: "gpt-5-mini", needsKey: true },
  openrouter: { label: "OpenRouter", protocol: "openai", baseURL: "https://openrouter.ai/api/v1", needsKey: true },
  deepseek: { label: "DeepSeek", protocol: "openai", baseURL: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", needsKey: true },
  gemini: { label: "Google Gemini", protocol: "openai", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", needsKey: true },
  yandex: { label: "Yandex AI Studio", protocol: "openai", baseURL: "https://llm.api.cloud.yandex.net/v1", needsKey: true },
  cloudru: { label: "Cloud.ru", protocol: "openai", baseURL: "https://foundation-models.api.cloud.ru/v1", needsKey: true },
  ollama: { label: "Ollama (локально)", protocol: "openai", baseURL: "http://localhost:11434/v1", needsKey: false },
  custom: { label: "OpenAI-совместимый API", protocol: "openai", needsKey: true },
};

/** Наборы переменных по очереди: основная модель и две запасные. */
const SLOTS = [
  { suffix: "", title: "Основная модель" },
  { suffix: "_2", title: "Запасная модель №1" },
  { suffix: "_3", title: "Запасная модель №2" },
] as const;

/** Сколько ждать начала ответа, прежде чем перейти к следующей модели. */
const FIRST_CHUNK_TIMEOUT_MS = 15_000;
/** Модель, которая сначала размышляет (MiniMax, DeepSeek и др.), начинает писать позже — ждём её первых слов дольше. */
const FIRST_TEXT_TIMEOUT_MS = 40_000;
/** Модель на своём компьютере (Ollama, LM Studio) без видеокарты начинает отвечать намного дольше. */
const LOCAL_FIRST_CHUNK_TIMEOUT_MS = 180_000;
/**
 * Последней модели в очереди уступать некому: если её оборвать, посетитель получит только базовую трактовку.
 * Поэтому её первых слов ждём дольше. Посредники вроде tokenator бывают медленными: Opus перед ответом
 * на Кельтский крест молчал до 50 с. Укладывается в лимит функции на хостинге (maxDuration в api/reading).
 */
const LAST_MODEL_FIRST_TEXT_TIMEOUT_MS = 90_000;

export interface AiReady {
  /** «Основная модель», «Запасная модель №1»… — для подсказок при разработке и журнала сервера */
  title: string;
  /** окончание имён переменных этой модели: "", "_2" или "_3" */
  suffix: string;
  provider: string;
  label: string;
  protocol: Protocol;
  apiKey: string;
  model: string;
  baseURL?: string;
  /** ID каталога Yandex Cloud: Яндекс просит передавать его вместе с запросом */
  project?: string;
  effort?: Effort;
  maxTokens: number;
  /** серверный запасной вариант Claude при отказе модели — только для прямого API Anthropic */
  fallbacks: boolean;
  /** сколько ждать хоть какого-то ответа — первых слов или начала размышлений, мс */
  firstChunkTimeoutMs: number;
  /** сколько ждать первых слов, если модель сначала размышляет, мс */
  firstTextTimeoutMs: number;
}

export interface AiChain {
  mode: "ai";
  /** модели в порядке очереди: основная, затем запасные */
  chain: AiReady[];
  /** что заполнено с ошибкой и поэтому пропущено — показывается только при локальной разработке */
  problems: string[];
}

export interface AiDemo {
  mode: "demo";
  /** почему демо-режим — показывается только при локальной разработке */
  reason: string;
}

export type AiConfig = AiChain | AiDemo;

const env = (name: string) => (process.env[name] ?? "").trim();

/** Угадываем провайдера по виду ключа, если AI_PROVIDER не указан. */
function guessProvider(key: string): string {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("AIza")) return "gemini";
  return "openai";
}

const isLocalURL = (url: string | undefined) =>
  !!url && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);

/** Читает один набор переменных: готовая модель, null — набор пуст, строка — что заполнено не так. */
function readSlot(
  { suffix, title }: (typeof SLOTS)[number],
  effort: Effort | undefined,
  maxTokens: number,
): AiReady | string | null {
  const name = (base: string) => base + suffix;
  const problem = (text: string) => `${title} не подключена — ${text}`;

  const apiKey = env(name("AI_API_KEY"));
  let provider = env(name("AI_PROVIDER")).toLowerCase();
  const modelVar = env(name("AI_MODEL"));
  const baseVar = env(name("AI_BASE_URL"));

  if (!apiKey && !provider) {
    // У основной модели пустой ключ — обычное состояние «ещё не настроено».
    return suffix && (modelVar || baseVar) ? problem(`заполните ${name("AI_API_KEY")} или ${name("AI_PROVIDER")}`) : null;
  }
  if (!provider) provider = guessProvider(apiKey);

  const preset = PRESETS[provider];
  if (!preset) {
    return problem(`неизвестный ${name("AI_PROVIDER")} «${provider}»; варианты: ${Object.keys(PRESETS).join(", ")}`);
  }
  if (preset.needsKey && !apiKey) return problem(`для провайдера ${preset.label} нужен ${name("AI_API_KEY")}`);

  const model = modelVar || preset.defaultModel || "";
  if (!model) return problem(`укажите ${name("AI_MODEL")}: для провайдера ${preset.label} модель нужно выбрать вручную`);

  const baseURL = baseVar || preset.baseURL;
  if (provider === "custom" && !baseURL) return problem(`для custom укажите адрес API в ${name("AI_BASE_URL")}`);

  const local = isLocalURL(baseURL);
  return {
    title,
    suffix,
    provider,
    label: preset.label,
    protocol: preset.protocol,
    apiKey,
    model,
    baseURL,
    // Модели Яндекса называются gpt://<ID каталога>/<модель> — ID каталога берём оттуда же.
    project: provider === "yandex" ? /^gpt:\/\/([^/]+)\//.exec(model)?.[1] : undefined,
    effort: effort ?? (preset.protocol === "anthropic" ? "low" : undefined),
    maxTokens,
    fallbacks: preset.protocol === "anthropic" && !baseVar,
    firstChunkTimeoutMs: local ? LOCAL_FIRST_CHUNK_TIMEOUT_MS : FIRST_CHUNK_TIMEOUT_MS,
    firstTextTimeoutMs: local ? LOCAL_FIRST_CHUNK_TIMEOUT_MS : FIRST_TEXT_TIMEOUT_MS,
  };
}

export function getAiConfig(): AiConfig {
  const effortRaw = env("AI_EFFORT").toLowerCase();
  const effort = (["low", "medium", "high", "xhigh", "max"] as const).find((e) => e === effortRaw);
  const maxTokens = Math.min(Math.max(Number(env("AI_MAX_TOKENS")) || 8000, 1000), 64000);

  const chain: AiReady[] = [];
  const problems: string[] = [];
  for (const slot of SLOTS) {
    const result = readSlot(slot, effort, maxTokens);
    if (typeof result === "string") problems.push(result);
    else if (result) chain.push(result);
  }

  if (chain.length === 0) {
    return { mode: "demo", reason: problems[0] ?? "API-ключ не указан — заполните AI_API_KEY в файле .env.local" };
  }
  if (chain[0].suffix !== "" && !problems.some((p) => p.startsWith(SLOTS[0].title))) {
    problems.unshift("Основная модель не указана (пусты AI_API_KEY и AI_PROVIDER) — отвечают запасные");
  }
  const last = chain[chain.length - 1];
  last.firstChunkTimeoutMs = Math.max(last.firstChunkTimeoutMs, LAST_MODEL_FIRST_TEXT_TIMEOUT_MS);
  last.firstTextTimeoutMs = Math.max(last.firstTextTimeoutMs, LAST_MODEL_FIRST_TEXT_TIMEOUT_MS);
  return { mode: "ai", chain, problems };
}
