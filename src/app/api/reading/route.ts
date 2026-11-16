// POST /api/reading — трактовка расклада потоком событий (NDJSON).
// Ключа нет → базовая трактовка. Ключ есть → ответ модели. Если основная модель не ответила —
// по очереди запасные (AI_*_2, AI_*_3), а если не ответил никто — базовая трактовка.
// Платный расклад открывается только с подтверждением оплаты именно за него (поле payment, см. lib/payments).
// При локальной разработке каждый ИИ-расклад пишется в журнал logs/readings.jsonl — для сравнения моделей.

import { capturePayment, checkPayment, isFreeReading } from "@/lib/payments/server";
import { PRICES, formatRub } from "@/config/pricing";
import { SPREADS } from "@/data/spreads";
import { getAiConfig, type AiReady } from "@/lib/ai/config";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/ai/prompt";
import { attemptModel, requestedEffort } from "@/lib/ai/providers";
import { looksComplete } from "@/lib/ai/reading-completion";
import { buildDemoReading, streamDemo } from "@/lib/ai/demo";
import { allowFreeReading, allowReading } from "@/lib/ai/rate-limit";
import { appendReadingLog, describeStats, logAttempt, newReadingLog, type ReadingLogEntry } from "@/lib/ai/reading-log";
import { parseReadingRequest, type ReadingEvent } from "@/lib/reading-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Медленная модель может молчать до 90 с (последняя в очереди) и ещё около минуты писать Кельтский крест.
// На бесплатном тарифе Vercel допустимо до 300 с.
export const maxDuration = 180;

const isDev = process.env.NODE_ENV !== "production";

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** «Основная модель (DeepSeek, модель deepseek-chat)» — для подсказок и журнала сервера. */
const who = (m: AiReady) => `${m.title} (${m.label}, модель ${m.model})`;

/** Подпись «Отвечает ИИ: …» над трактовкой — видна только при локальной разработке. */
function describeModel(m: AiReady, backups: number): string {
  const effort = requestedEffort(m);
  const name = `${m.label}, модель ${m.model}${effort ? `, глубина размышлений ${effort}` : ""}`;
  if (m.suffix) return `${lowerFirst(m.title)} — ${name}`;
  return backups > 0 ? `${name} (запасных: ${backups})` : name;
}

/** Ошибки в настройках пишем в журнал сервера один раз, а не при каждом раскладе. */
const reported = new Set<string>();
function reportOnce(message: string) {
  if (reported.has(message)) return;
  reported.add(message);
  console.warn(`[reading] ${message}`);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = parseReadingRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const req = parsed.value;

  const payment = checkPayment(req, (body as { payment?: unknown }).payment);
  if (!payment.ok) return Response.json({ error: payment.error, code: "payment_required" }, { status: 402 });
  const paidOrder = payment.paid ? payment.order : null;
  const paid = paidOrder !== null;

  // бесплатная подсказка: запасная проверка по адресу (основной лимит «раз в день» считает браузер)
  if (!paid && isFreeReading(req.spreadId) && !allowFreeReading(clientKey(request))) {
    return Response.json(
      {
        error: `Бесплатная подсказка на сегодня уже была — следующая завтра. Сейчас подсказка стоит ${formatRub(PRICES[req.spreadId])}.`,
        code: "free_limit",
      },
      { status: 402 },
    );
  }

  const cfg = getAiConfig();
  // оплаченную трактовку лимит частоты не урезает
  const limited = cfg.mode === "ai" && !paid && !allowReading(clientKey(request));

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReadingEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const sendDemo = async () => {
        for await (const text of streamDemo(buildDemoReading(req), abort.signal)) send({ type: "text", text });
      };
      /** запись этого расклада в журнал для сравнения моделей — только при локальной разработке */
      let log: ReadingLogEntry | null = null;
      /** трактовка пришла — заблокированную сумму можно списать */
      const settle = () => {
        if (!paidOrder?.held) return;
        capturePayment(paidOrder);
        send({ type: "payment", status: "captured", orderId: paidOrder.id, amount: paidOrder.amount });
      };

      try {
        if (paidOrder) {
          send({ type: "payment", status: paidOrder.held ? "held" : "paid", orderId: paidOrder.id, amount: paidOrder.amount });
        }
        if (cfg.mode === "demo") {
          send({ type: "meta", mode: "demo", detail: isDev ? cfg.reason : undefined });
          await sendDemo();
          if (!abort.signal.aborted) settle();
        } else if (limited) {
          send({ type: "meta", mode: "demo" });
          send({
            type: "notice",
            text: "Вы сделали много раскладов за последний час, поэтому сейчас показана базовая трактовка по значениям карт.",
          });
          await sendDemo();
        } else {
          const { chain } = cfg;
          for (const problem of cfg.problems) {
            reportOnce(problem);
            if (isDev) send({ type: "notice", text: problem });
          }
          send({ type: "meta", mode: "ai", detail: isDev ? describeModel(chain[0], chain.length - 1) : undefined });

          const system = buildSystemPrompt();
          const user = buildUserPrompt(req);
          if (isDev) log = newReadingLog(req, system);
          let showDemo = true;
          /** трактовка уже дописана до конца; всё, что модель пришлёт после, — задвоение, посетителю не показываем */
          let complete = false;
          let extra = 0;

          /** Переход к следующей модели: в журнал сервера, а при разработке — и над трактовкой. */
          const tryNext = (failure: string, next: AiReady) => {
            console.warn(`[reading] Следующая попытка — ${lowerFirst(who(next))}`);
            if (isDev) {
              send({ type: "notice", text: `${failure}. Следующая попытка — ${lowerFirst(who(next))}.` });
              send({ type: "meta", mode: "ai", detail: describeModel(next, 0) });
            }
          };

          for (const [i, model] of chain.entries()) {
            let answer = "";
            const next = chain[i + 1];
            // Трактовка должна начинаться с заголовка «### …». Если модель начала со вступления или жирного текста,
            // формат сломан: раздела «Вопрос для размышления» потом, как правило, тоже нет. Когда есть запасная модель,
            // начало ответа придерживаем, пока формат не станет ясен, а сломанный ответ отбрасываем — посетитель его не видит.
            let held: string | null = next ? "" : null;
            let brokenFormat = false;
            const firstHeading = new RegExp(
              `^#{1,4}[ \\t]+(?:\\*\\*)?(?:\\d+[.)][ \\t]*)?${escapeRegExp(SPREADS[req.spreadId].positions[0].title)}`,
            );
            const attempt = new AbortController();
            const stopAttempt = () => attempt.abort();
            abort.signal.addEventListener("abort", stopAttempt, { once: true });

            const pass = (text: string) => {
              answer += text;
              if (log) log.answer += text;
              if (complete) {
                // Посредники (например, tokenator) изредка после готового ответа присылают его заново.
                extra += text.length;
                return;
              }
              send({ type: "text", text });
              if (looksComplete(answer)) {
                complete = true;
                if (extra > 0) {
                  console.warn(`[reading] ${who(model)}: после конца трактовки пришло ещё ${extra} символов — скрыто как задвоение`);
                  extra = 0;
                }
              }
            };

            const result = await attemptModel(
              model,
              system,
              user,
              attempt.signal,
              (text) => {
                if (brokenFormat) return;
                if (held === null) return pass(text);
                held += text;
                const start = held.trimStart();
                if (!start) return;
                // Первая строка должна быть заголовком первой позиции расклада: «### Суть ситуации — …».
                // Ждём, пока она придёт целиком; если начало не «#», ждать незачем.
                if (start.startsWith("#") && !start.includes("\n") && start.length < 160) return;
                if (!firstHeading.test(start)) {
                  brokenFormat = true;
                  attempt.abort();
                  return;
                }
                const out = held;
                held = null;
                pass(out);
              },
              { withUsage: isDev },
            );
            abort.signal.removeEventListener("abort", stopAttempt);
            if (abort.signal.aborted) {
              log?.attempts.push(logAttempt(model, result));
              return;
            }
            if (brokenFormat && next) {
              const why = "Начала не с первой позиции расклада — формат трактовки не соблюдён, ответ отброшен";
              log?.attempts.push(logAttempt(model, { ok: false, produced: false, refused: false, why, stats: result.stats }));
              const failure = `${who(model)}: ${lowerFirst(why)}`;
              console.warn(`[reading] ${failure}`);
              tryNext(failure, next);
              continue;
            }
            // очень короткий ответ мог целиком остаться в придержанном начале
            if (held) pass(held);
            log?.attempts.push(logAttempt(model, result));
            // соединение оборвалось уже после последнего раздела — трактовка получена целиком
            const deliveredAnyway = !result.ok && result.produced && looksComplete(answer);
            if (deliveredAnyway) {
              console.warn(
                `[reading] ${who(model)}: соединение закрылось без сигнала «ответ окончен» (${lowerFirst(result.why)}), но трактовка пришла целиком — считаем её полученной`,
              );
              if (log) log.outcome = i > 0 ? "backup" : "ai";
              settle();
              showDemo = false;
              break;
            }
            if (result.ok) {
              if (i > 0) console.warn(`[reading] Ответила ${lowerFirst(who(model))}`);
              if (log) {
                log.outcome = i > 0 ? "backup" : "ai";
                // скорость и токены — в терминал и в подпись «Отвечает ИИ» над трактовкой
                const stats = describeStats(result.stats);
                console.info(`[reading] ${who(model)}: ${stats}`);
                send({ type: "meta", mode: "ai", detail: `${describeModel(model, i === 0 ? chain.length - 1 : 0)} · ${stats}` });
              }
              settle();
              showDemo = false;
              break;
            }

            const failure = `${who(model)}: ${lowerFirst(result.why)}`;
            console.error(`[reading] ${failure}`);

            if (result.produced) {
              // Часть трактовки посетитель уже видит — вторую, от другой модели, к ней не приклеиваем.
              if (log) log.outcome = "interrupted";
              send({
                type: "notice",
                text: isDev
                  ? `Ответ прервался. ${failure}`
                  : paid
                    ? "Ответ прервался. Оплата сохранена — трактовку можно запросить ещё раз, это бесплатно."
                    : "Ответ прервался. Попробуйте сделать расклад ещё раз чуть позже.",
              });
              send({ type: "fallback", basic: false });
              showDemo = false;
              break;
            }

            // Отказ модели отвечать по существу — не технический сбой, запасной моделью его не обходим.
            if (result.refused || !next) {
              if (log) log.outcome = "demo";
              // Что ниже базовая трактовка, страница объясняет сама; причина сбоя — только при разработке.
              if (isDev) send({ type: "notice", text: `${failure}. Показана базовая трактовка.` });
              send({ type: "fallback", basic: true });
              break;
            }

            tryNext(failure, next);
          }

          if (showDemo) await sendDemo();
        }
        send({ type: "done" });
      } catch (err) {
        if (!abort.signal.aborted) {
          if (log) log.outcome = "error";
          console.error("[reading] непредвиденная ошибка:", err);
          send({ type: "error", text: "Не удалось составить трактовку. Попробуйте ещё раз." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // поток уже закрыт — посетитель ушёл со страницы
        }
        if (log) void appendReadingLog(log);
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
