// Потоковые запросы к моделям: Claude через официальный SDK Anthropic,
// все остальные провайдеры — через официальный SDK OpenAI (OpenAI-совместимый API).

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AiReady, Effort } from "./config";

export class ModelRefusalError extends Error {
  constructor() {
    super("Модель отказалась отвечать на этот запрос");
  }
}

/** Токены одного ответа — по данным провайдера. */
export interface Usage {
  /** на входе: инструкция для модели и описание расклада */
  input: number;
  /** на выходе: текст трактовки вместе со скрытыми размышлениями модели */
  output: number;
  /** из них скрытые размышления — если провайдер их сообщает */
  reasoning?: number;
}

/** Сведения, которые приходят вместе с текстом ответа. */
export interface StreamInfo {
  usage: Usage | null;
  /** как провайдер назвал ответившую модель — у посредников так видно, что стоит за названием */
  servedModel?: string;
  /** модель прислала часть размышлений: она работает, хотя ещё не пишет ответ */
  onThinking?: () => void;
  /** глубина размышлений, с которой ушёл запрос */
  effort?: Effort;
  /** провайдер отклонил глубину размышлений, и запрос повторили без неё */
  effortRejected?: boolean;
}

/** Размышления посетителю не показываем. DeepSeek, GLM, MiniMax и др. присылают их в reasoning_content, OpenRouter — в reasoning. */
function hasThought(delta: object | undefined): boolean {
  const d = delta as { reasoning_content?: unknown; reasoning?: unknown } | undefined;
  return !!d && [d.reasoning_content, d.reasoning].some((v) => typeof v === "string" && v.length > 0);
}

/** Параметр effort понимают только современные модели Claude. */
function supportsEffort(model: string): boolean {
  return /^claude-(fable|mythos|opus|sonnet|haiku)-5/.test(model) || /^claude-opus-4-[5-8]/.test(model) || /^claude-sonnet-4-6/.test(model);
}

/**
 * Глубина размышлений (AI_EFFORT), которую передаём модели. Claude напрямую получает её как output_config.effort
 * (если модель её понимает), остальные — как reasoning_effort, и только когда AI_EFFORT заполнен.
 */
export function requestedEffort(cfg: AiReady): Effort | undefined {
  if (cfg.protocol === "anthropic") return supportsEffort(cfg.model) ? cfg.effort : undefined;
  return cfg.effort;
}

async function* streamAnthropic(cfg: AiReady, system: string, user: string, signal: AbortSignal, info: StreamInfo) {
  const client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, maxRetries: 1 });
  const effort = requestedEffort(cfg);
  info.effort = effort;
  const stream = client.beta.messages.stream(
    {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      ...(effort ? { output_config: { effort } } : {}),
      // Если основная модель откажется отвечать, Anthropic сам повторит запрос на запасной.
      ...(cfg.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type !== "content_block_delta") continue;
    if (event.delta.type === "text_delta") yield event.delta.text;
    else if (event.delta.type === "thinking_delta") info.onThinking?.();
  }
  const final = await stream.finalMessage();
  const u = final.usage;
  info.usage = {
    input: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    output: u.output_tokens,
  };
  info.servedModel = final.model;
  if (final.stop_reason === "refusal") throw new ModelRefusalError();
}

async function* streamOpenAICompatible(
  cfg: AiReady,
  system: string,
  user: string,
  signal: AbortSignal,
  info: StreamInfo,
  withUsage: boolean,
) {
  const client = new OpenAI({ apiKey: cfg.apiKey || "not-needed", baseURL: cfg.baseURL, project: cfg.project, maxRetries: 1 });
  const open = (countTokens: boolean, effort: Effort | undefined) =>
    client.chat.completions.create(
      {
        model: cfg.model,
        stream: true,
        // Без этой просьбы большинство провайдеров не сообщает, сколько токенов ушло на ответ.
        ...(countTokens ? { stream_options: { include_usage: true } } : {}),
        // Глубина размышлений (AI_EFFORT). Модели, которые не умеют размышлять, обычно просто её не замечают.
        ...(effort ? { reasoning_effort: effort } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { signal },
    );

  // Не все OpenAI-совместимые сервисы знают необязательные поля. Если запрос отклонён (400/422),
  // повторяем его без глубины размышлений, а если не помогло и это — ещё и без подсчёта токенов.
  const requested = requestedEffort(cfg);
  let effort = requested;
  let countTokens = withUsage;
  let stream: Awaited<ReturnType<typeof open>> | undefined;
  while (!stream) {
    info.effort = effort;
    try {
      stream = await open(countTokens, effort);
    } catch (err) {
      const rejected = err instanceof OpenAI.BadRequestError || err instanceof OpenAI.UnprocessableEntityError;
      if (rejected && effort) effort = undefined;
      else if (rejected && countTokens) countTokens = false;
      else throw err;
    }
  }
  if (requested && !effort) info.effortRejected = true;

  for await (const chunk of stream) {
    if (chunk.model) info.servedModel = chunk.model;
    if (chunk.usage) {
      info.usage = {
        input: chunk.usage.prompt_tokens,
        output: chunk.usage.completion_tokens,
        reasoning: chunk.usage.completion_tokens_details?.reasoning_tokens,
      };
    }
    const delta = chunk.choices[0]?.delta;
    if (hasThought(delta)) info.onThinking?.();
    if (delta?.content) yield delta.content;
  }
}

/** withUsage — попросить OpenAI-совместимого провайдера сообщить токены (Anthropic сообщает всегда). */
export function streamModel(
  cfg: AiReady,
  system: string,
  user: string,
  signal: AbortSignal,
  info: StreamInfo = { usage: null },
  withUsage = false,
): AsyncGenerator<string> {
  return cfg.protocol === "anthropic"
    ? streamAnthropic(cfg, system, user, signal, info)
    : streamOpenAICompatible(cfg, system, user, signal, info, withUsage);
}

/** Как прошла попытка — для журнала сравнения моделей и подписи при разработке. */
export interface AttemptStats {
  /** через сколько мс от запроса модель начала размышлять; null — не размышляла или провайдер этого не показывает */
  firstThoughtMs: number | null;
  /** через сколько мс от запроса пришли первые слова ответа; null — не пришли */
  firstTextMs: number | null;
  /** сколько длилась попытка целиком, мс */
  totalMs: number;
  /** токены по данным провайдера; null — провайдер их не сообщил */
  usage: Usage | null;
  servedModel?: string;
  /** глубина размышлений, с которой ушёл запрос (AI_EFFORT); нет — не передавали */
  effort?: Effort;
  /** провайдер отклонил глубину размышлений, и запрос повторили без неё */
  effortRejected?: boolean;
  /** техническая причина сбоя со всей цепочкой причин — для журнала */
  error?: string;
}

export type Attempt = (
  | { ok: true }
  | {
      ok: false;
      /** часть текста уже ушла посетителю */
      produced: boolean;
      /** модель отказалась отвечать по существу — это не сбой */
      refused: boolean;
      /** понятная причина — для подсказки при разработке и журнала сервера */
      why: string;
    }
) & { stats: AttemptStats };

const sec = (ms: number) => `${Math.round(ms / 1000)} с`;

/**
 * Одна попытка получить трактовку у одной модели; текст сразу уходит в onText.
 * Если модель молчит дольше cfg.firstChunkTimeoutMs, попытка прерывается, чтобы без долгого
 * ожидания перейти к запасной модели. Модель, которая сначала размышляет, не молчит, а работает, —
 * её первых слов ждём до cfg.firstTextTimeoutMs. Столько же ждём и молчащую модель, если её попросили
 * размышлять глубже обычного (AI_EFFORT): многие провайдеры свои размышления не присылают.
 */
export async function attemptModel(
  cfg: AiReady,
  system: string,
  user: string,
  signal: AbortSignal,
  onText: (text: string) => void,
  { withUsage = false }: { withUsage?: boolean } = {},
): Promise<Attempt> {
  const attempt = new AbortController();
  const stop = () => attempt.abort();
  if (signal.aborted) attempt.abort();
  else signal.addEventListener("abort", stop, { once: true });

  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  let firstThoughtMs: number | null = null;
  let firstTextMs: number | null = null;

  /** почему попытку прервали по времени; null — не прерывали */
  let timeout: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** прервать попытку, если к моменту ms от начала она не продвинется дальше */
  const deadline = (ms: number, why: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timeout = why;
      attempt.abort();
    }, Math.max(0, ms - elapsed()));
  };
  // Если модель просят размышлять глубже обычного (AI_EFFORT), многие провайдеры молчат, пока она думает, —
  // тогда и первого признака жизни ждём столько же, сколько первых слов размышляющей модели.
  const effort = requestedEffort(cfg);
  const firstWait =
    effort && effort !== "low" ? Math.max(cfg.firstChunkTimeoutMs, cfg.firstTextTimeoutMs) : cfg.firstChunkTimeoutMs;
  deadline(firstWait, `Не начала отвечать за ${sec(firstWait)}`);

  const info: StreamInfo = {
    usage: null,
    onThinking: () => {
      if (firstThoughtMs !== null || firstTextMs !== null) return;
      firstThoughtMs = elapsed();
      deadline(cfg.firstTextTimeoutMs, `Размышляла ${sec(cfg.firstTextTimeoutMs)} и так и не начала писать`);
    },
  };
  const stats = (error?: string): AttemptStats => ({
    firstThoughtMs,
    firstTextMs,
    totalMs: elapsed(),
    usage: info.usage,
    servedModel: info.servedModel,
    effort: info.effort,
    effortRejected: info.effortRejected,
    error,
  });
  const closed = "Страницу закрыли, не дождавшись ответа";

  try {
    for await (const text of streamModel(cfg, system, user, attempt.signal, info, withUsage)) {
      if (firstTextMs === null) {
        firstTextMs = elapsed();
        clearTimeout(timer);
      }
      onText(text);
    }
    if (firstTextMs !== null) return { ok: true, stats: stats() };
    // Прерванный поток SDK OpenAI не считает ошибкой и просто завершает — причину берём из таймера.
    const why = timeout ?? (signal.aborted ? closed : "Прислала пустой ответ");
    return { ok: false, produced: false, refused: false, why, stats: stats(timeout ?? undefined) };
  } catch (err) {
    const why = timeout ?? (signal.aborted ? closed : describeAiError(err, cfg.suffix));
    return {
      ok: false,
      produced: firstTextMs !== null,
      refused: err instanceof ModelRefusalError,
      why,
      stats: stats(timeout ?? errorChain(err)),
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

function errorCode(err: Error): string | undefined {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Код сетевой ошибки из цепочки причин (ECONNRESET, ENOTFOUND…) — подсказывает, что именно сломалось. */
function networkCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const code = errorCode(current);
    if (code) return code;
    current = current.cause;
  }
  return undefined;
}

/** Техническая причина сбоя целиком: «Connection error. ← fetch failed ← read ECONNRESET». */
function errorChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 5; depth++) {
    if (!(current instanceof Error)) {
      parts.push(String(current));
      break;
    }
    const code = errorCode(current);
    parts.push(code && !current.message.includes(code) ? `${current.message} [${code}]` : current.message);
    current = current.cause;
  }
  return parts.join(" ← ");
}

/** Понятное описание ошибки — для подсказки при локальной разработке. suffix — окончание имён переменных модели. */
export function describeAiError(err: unknown, suffix = ""): string {
  if (err instanceof ModelRefusalError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError) {
    return `Ключ не принят провайдером (401) — проверьте AI_API_KEY${suffix}`;
  }
  if (err instanceof Anthropic.NotFoundError || err instanceof OpenAI.NotFoundError) {
    return `Модель не найдена (404) — проверьте AI_MODEL${suffix}`;
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError) {
    return "Провайдер ограничил частоту запросов (429) или закончились средства на счёте";
  }
  if (err instanceof Anthropic.PermissionDeniedError || err instanceof OpenAI.PermissionDeniedError) {
    return "Доступ запрещён (403) — у ключа нет прав на эту модель или провайдер недоступен из вашего региона";
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    const code = networkCode(err);
    return `Не удалось соединиться с провайдером${code ? ` (${code})` : ""} — проверьте интернет или AI_BASE_URL${suffix}`;
  }
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    const message = err.message.replace(/^\d{3}\s+/, ""); // SDK сам начинает текст с кода ответа
    return err.status ? `Ошибка API ${err.status}: ${message}` : `Ошибка API: ${message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
