// POST /api/reading — трактовка расклада потоком событий (NDJSON).
// Ключа нет → базовая трактовка. Ключ есть → ответ модели. Если основная модель не ответила —
// по очереди запасные (AI_*_2, AI_*_3), а если не ответил никто — базовая трактовка.
// Платный расклад открывается только с подтверждением оплаты именно за него (поле payment, см. lib/payments).
// При локальной разработке каждый ИИ-расклад пишется в журнал logs/readings.jsonl — для сравнения моделей.

import { capturePayment, checkPayment, isFreeReading } from "@/lib/payments/server";
import { PRICES, formatRub } from "@/config/pricing";
import { getAiConfig, type AiReady } from "@/lib/ai/config";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/ai/prompt";
import { attemptModel, requestedEffort } from "@/lib/ai/providers";
import { buildDemoReading, streamDemo } from "@/lib/ai/demo";
import { allowFreeReading, allowReading } from "@/lib/ai/rate-limit";
import { appendReadingLog, describeStats, logAttempt, newReadingLog, type ReadingLogEntry } from "@/lib/ai/reading-log";
import { parseReadingRequest, type ReadingEvent } from "@/lib/reading-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isDev = process.env.NODE_ENV !== "production";

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

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

          for (const [i, model] of chain.entries()) {
            const result = await attemptModel(
              model,
              system,
              user,
              abort.signal,
              (text) => {
                if (log) log.answer += text;
                send({ type: "text", text });
              },
              { withUsage: isDev },
            );
            log?.attempts.push(logAttempt(model, result));
            if (abort.signal.aborted) return;
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
              send({ type: "fallback" });
              showDemo = false;
              break;
            }

            const next = chain[i + 1];
            // Отказ модели отвечать по существу — не технический сбой, запасной моделью его не обходим.
            if (result.refused || !next) {
              if (log) log.outcome = "demo";
              send({
                type: "notice",
                text: isDev
                  ? `${failure}. Показана базовая трактовка.`
                  : paid
                    ? "ИИ сейчас не ответил, поэтому ниже — базовая трактовка по значениям карт. Оплата сохранена: персональную трактовку можно запросить ещё раз — бесплатно."
                    : "Сейчас не получилось связаться с ИИ, поэтому показана базовая трактовка по значениям карт.",
              });
              send({ type: "fallback" });
              break;
            }

            console.warn(`[reading] Следующая попытка — ${lowerFirst(who(next))}`);
            if (isDev) {
              send({ type: "notice", text: `${failure}. Следующая попытка — ${lowerFirst(who(next))}.` });
              send({ type: "meta", mode: "ai", detail: describeModel(next, 0) });
            }
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
