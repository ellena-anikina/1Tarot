"use client";

// Стол расклада: вопрос → перемешивание → выбор карт из веера → переворот → [оплата] → трактовка.
// Платный расклад останавливается после переворота: карты и их значения видны, персональная трактовка — после
// оплаты. Перед уходом на страницу оплаты расклад сохраняется в браузере (lib/payments/client), а по возвращении
// (/?oplata=<заказ>) стол восстанавливается и трактовка запрашивается с подтверждением оплаты.

import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawnCard, LiteCard } from "@/data/types";
import { SPREADS, SPREAD_LIST, cardsWord, type SpreadId } from "@/data/spreads";
import type { TopicId } from "@/data/topics";
import { FEATURED_SPREAD, FREE_PER_DAY, FREE_SPREAD, PRICES, formatRub, priceOf, type PaymentsInfo } from "@/config/pricing";
import { pickRandomIndexes, shuffleDeck } from "@/lib/deck";
import { addJournalEntry, newEntryId } from "@/lib/journal";
import {
  FREE_KEY,
  exhaustFreeReadings,
  findPending,
  freeLeftToday,
  refundFreeReading,
  removePending,
  resumablePending,
  savePending,
  spendFreeReading,
  type PendingReading,
} from "@/lib/payments/client";
import type { ReadingEvent } from "@/lib/reading-protocol";
import { toPlainText } from "./markdown-lite";
import { DeckStack } from "./DeckStack";
import { Fan } from "./Fan";
import { SpreadView } from "./SpreadView";
import { QuestionForm } from "./QuestionForm";
import { Interpretation, type ReleaseState } from "./Interpretation";
import { Paywall, type PayState } from "./Paywall";
import { CardDialog } from "./CardDialog";
import styles from "./reading.module.css";

type Phase = "ask" | "shuffle" | "pick" | "reveal" | "pay" | "read";
type Status = "idle" | "streaming" | "done" | "error";

interface Session {
  question: string;
  topicId: TopicId | null;
  spreadId: SpreadId;
  /** цена трактовки в рублях; 0 — бесплатно */
  price: number;
  /** расклад тратит бесплатную подсказку на сегодня */
  free: boolean;
  /** номер заказа, если дошло до оплаты */
  orderId?: string;
  /** подтверждение оплаты — с ним сервер откроет трактовку */
  proof?: string;
}

const EMPTY_SESSION: Session = { question: "", topicId: null, spreadId: FEATURED_SPREAD, price: 0, free: false };

/** Оплаченный расклад пишется в дневник под одним номером — повторная трактовка заменит запись, а не добавит новую. */
const paidEntryId = (orderId: string) => `paid-${orderId}`;

const RETURN_MESSAGES: Record<string, string> = {
  canceled: "Оплата не завершена. Карты сохранены — вернитесь к оплате, когда будете готовы.",
  failed: "Банк не подтвердил платёж, деньги не списаны. Карты сохранены — попробуйте ещё раз.",
};

async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: ReadingEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as ReadingEvent);
    }
  }
  const rest = (buffer + decoder.decode()).trim();
  if (rest) onEvent(JSON.parse(rest) as ReadingEvent);
}

export function ReadingTable({ deck, payments }: { deck: LiteCard[]; payments: PaymentsInfo }) {
  const reduce = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [topicId, setTopicId] = useState<TopicId | null>(null);
  const [spreadId, setSpreadId] = useState<SpreadId>(FEATURED_SPREAD);

  /** бесплатных подсказок на сегодня; до чтения хранилища считаем, что подсказка есть */
  const [freeLeft, setFreeLeft] = useState(FREE_PER_DAY);
  const [payState, setPayState] = useState<PayState>({ status: "idle" });
  const [payNotice, setPayNotice] = useState<string | null>(null);
  /** оплаченная трактовка не пришла — её можно запросить снова */
  const [retryable, setRetryable] = useState(false);
  /** ИИ не ответил — показана базовая трактовка по значениям карт */
  const [basic, setBasic] = useState(false);
  /** строка об оплате над трактовкой: заблокировано, оплачено, списано */
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  /** оплата картой: сумма пока только заблокирована */
  const [held, setHeld] = useState(false);
  /** отказ от трактовки, которая не пришла: снять блокировку или вернуть деньги */
  const [release, setRelease] = useState<ReleaseState>({ status: "idle" });
  /** расклад, который ждёт оплаты или трактовки, — напоминание над формой */
  const [resume, setResume] = useState<PendingReading | null>(null);
  const [lostNote, setLostNote] = useState<string | null>(null);

  const [order, setOrder] = useState<DrawnCard[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [angles, setAngles] = useState<Record<number, number>>({});
  const [autoPicking, setAutoPicking] = useState(false);
  const [revealed, setRevealed] = useState(0);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [notices, setNotices] = useState<string[]>([]);
  const [mode, setMode] = useState<{ mode: "ai" | "demo"; detail?: string } | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [dialogSlot, setDialogSlot] = useState<number | null>(null);

  const tableRef = useRef<HTMLElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef("");
  const frameRef = useRef(0);
  const sessionRef = useRef<Session>(EMPTY_SESSION);

  const spread = SPREADS[spreadId];
  const need = spread.positions.length;
  const remaining = need - picked.length;
  const prices = Object.fromEntries(SPREAD_LIST.map((s) => [s.id, priceOf(s.id, payments, freeLeft)])) as Record<
    SpreadId,
    number
  >;

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(
    () => () => {
      clearTimers();
      abortRef.current?.abort();
      cancelAnimationFrame(frameRef.current);
    },
    []
  );

  // текст копится в ref и выводится не чаще кадра — так поток не перегружает отрисовку
  const appendText = (chunk: string) => {
    textRef.current += chunk;
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        setText(textRef.current);
      });
    }
  };
  const flushText = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    setText(textRef.current);
  };

  const scrollToTable = () =>
    tableRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

  function resetSession() {
    clearTimers();
    abortRef.current?.abort();
    setPicked([]);
    setAngles({});
    setAutoPicking(false);
    setRevealed(0);
    textRef.current = "";
    setText("");
    setStatus("idle");
    setNotices([]);
    setMode(null);
    setEntryId(null);
    setSaved(false);
    setActiveSlot(null);
    setDialogSlot(null);
    setPayState({ status: "idle" });
    setPayNotice(null);
    setRetryable(false);
    setBasic(false);
    setPaymentNote(null);
    setHeld(false);
    setRelease({ status: "idle" });
  }

  /** Бросаем неоплаченный заказ текущего расклада: посетитель передумал и начал заново. */
  function dropUnpaidOrder() {
    const s = sessionRef.current;
    if (s.orderId && !s.proof) removePending(s.orderId);
  }

  function start() {
    const chosen = spreadId;
    dropUnpaidOrder();
    resetSession();
    setResume(null);
    setLostNote(null);
    // лимит перечитываем из хранилища: подсказку могли взять в другой вкладке
    const left = freeLeftToday();
    setFreeLeft(left);
    const price = priceOf(chosen, payments, left);
    sessionRef.current = {
      question: question.trim(),
      topicId,
      spreadId: chosen,
      price,
      free: payments.enabled && price === 0 && chosen === FREE_SPREAD,
    };
    setOrder(shuffleDeck());
    setPhase("shuffle");
    if ((tableRef.current?.getBoundingClientRect().top ?? 0) < 0) scrollToTable();
    later(() => setPhase("pick"), reduce ? 60 : 1550);
  }

  function newReading() {
    dropUnpaidOrder();
    resetSession();
    sessionRef.current = EMPTY_SESSION;
    setPhase("ask");
    setResume(resumablePending());
    requestAnimationFrame(scrollToTable);
  }

  /** Восстанавливает расклад, сохранённый перед оплатой: карты сразу открыты. */
  function restore(p: PendingReading, message: string | null) {
    resetSession();
    setResume(null);
    setLostNote(null);
    sessionRef.current = {
      question: p.question,
      topicId: p.topicId,
      spreadId: p.spreadId,
      price: p.amount,
      free: false,
      orderId: p.orderId,
      proof: p.proof,
    };
    setQuestion(p.question);
    setTopicId(p.topicId);
    setSpreadId(p.spreadId);
    setOrder(p.cards);
    setPicked(p.cards.map((_, i) => i));
    setRevealed(p.cards.length);
    if (p.proof) {
      // строку об оплате пришлёт сервер первым событием: «заблокировано» или «оплачено»
      setPhase("read");
      void requestReading(p.cards, p.proof);
    } else {
      setPayNotice(message);
      setPhase("pay");
    }
    requestAnimationFrame(scrollToTable);
  }

  // бесплатный лимит меняется и в других вкладках, и с наступлением нового дня — сверяемся
  useEffect(() => {
    const sync = () => setFreeLeft(freeLeftToday());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === FREE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // при открытии страницы: возвращение со страницы оплаты или напоминание о неоконченном раскладе
  useEffect(() => {
    setFreeLeft(freeLeftToday());
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("oplata");
    if (!orderId) {
      setResume(resumablePending());
      return;
    }
    // Откладываем на следующий шаг. При разработке (npm run dev) React для проверки запускает стол дважды:
    // трактовка, начатая при первом запуске, обрывается при проверочном «закрытии», и страница зависала
    // на «Карты складываются в историю…». Отложенный запуск отменяется вместе с первым и выполняется один раз.
    const timer = window.setTimeout(() => {
      // убираем служебные параметры из адреса, чтобы обновление страницы не повторяло возврат
      window.history.replaceState(null, "", window.location.pathname);

      const pending = findPending(orderId);
      if (!pending) {
        setLostNote(
          `Заказ № ${orderId}: расклад сохранён в другом браузере или на другом устройстве. Откройте сайт там, где делали расклад, — трактовка будет ждать.`
        );
        return;
      }
      const proof = params.get("proof");
      if (proof) {
        const paid = { ...pending, proof };
        savePending(paid);
        restore(paid, null);
      } else {
        restore(pending, RETURN_MESSAGES[params.get("status") ?? ""] ?? RETURN_MESSAGES.canceled);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // запускается один раз при открытии страницы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    const s = sessionRef.current;
    const cards = picked.map((i) => order[i]);
    setPayState({ status: "creating" });
    setPayNotice(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: s.question, topicId: s.topicId, spreadId: s.spreadId, cards }),
      });
      const data = (await res.json().catch(() => null)) as {
        orderId?: string;
        amount?: number;
        confirmationUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.orderId || !data.confirmationUrl) {
        throw new Error(data?.error ?? `Сервер ответил ошибкой ${res.status}. Попробуйте ещё раз.`);
      }
      const saved = savePending({
        orderId: data.orderId,
        amount: data.amount ?? s.price,
        question: s.question,
        topicId: s.topicId,
        spreadId: s.spreadId,
        cards,
        createdAt: new Date().toISOString(),
      });
      if (!saved) {
        throw new Error("Браузер не дал сохранить расклад перед оплатой. Разрешите сайту хранить данные и попробуйте снова.");
      }
      dropUnpaidOrder();
      sessionRef.current = { ...s, orderId: data.orderId };
      window.location.assign(data.confirmationUrl);
    } catch (err) {
      setPayState({
        status: "error",
        message:
          err instanceof TypeError
            ? "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
            : err instanceof Error
              ? err.message
              : "Не удалось перейти к оплате.",
      });
    }
  }

  /** Повтор оплаченной трактовки — по тому же подтверждению оплаты. */
  function retryPaid() {
    const s = sessionRef.current;
    if (!s.proof) return;
    abortRef.current?.abort();
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    textRef.current = "";
    setText("");
    setNotices([]);
    setMode(null);
    setSaved(false);
    setRetryable(false);
    setBasic(false);
    setRelease({ status: "idle" });
    void requestReading(
      picked.map((i) => order[i]),
      s.proof
    );
  }

  /** Посетитель отказался от трактовки, которая не пришла: картой — снимаем блокировку, по СБП — возвращаем деньги. */
  async function releasePaid() {
    const s = sessionRef.current;
    if (!s.proof || !s.orderId) return;
    setRelease({ status: "working" });
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: s.proof }),
      });
      const data = (await res.json().catch(() => null)) as {
        result?: "canceled" | "refunded";
        amount?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.result) throw new Error(data?.error ?? `Сервер ответил ошибкой ${res.status}. Попробуйте ещё раз.`);
      removePending(s.orderId);
      sessionRef.current = { ...s, proof: undefined };
      const sum = formatRub(data.amount ?? s.price);
      setRetryable(false);
      setHeld(false);
      setPaymentNote(null);
      setRelease({
        status: "done",
        message:
          data.result === "canceled"
            ? `Блокировка снята: ${sum} снова доступны на карте. Деньги не списывались.`
            : `Деньги возвращены: ${sum} придут на счёт, с которого вы платили. Срок зачисления зависит от банка.`,
      });
    } catch (err) {
      setRelease({
        status: "error",
        message:
          err instanceof TypeError
            ? "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
            : err instanceof Error
              ? err.message
              : "Не получилось отменить оплату.",
      });
    }
  }

  const pick = useCallback(
    (index: number, angle: number) => {
      setPicked((prev) => (prev.length >= need || prev.includes(index) ? prev : [...prev, index]));
      setAngles((prev) => ({ ...prev, [index]: angle }));
    },
    [need]
  );

  function pickForMe() {
    setAutoPicking(true);
    const indexes = pickRandomIndexes(order.length, new Set(picked), remaining);
    indexes.forEach((index, k) => {
      const approxAngle = ((index / Math.max(1, order.length - 1)) * 2 - 1) * 30;
      later(() => pick(index, approxAngle), reduce ? 0 : k * 190);
    });
  }

  // все карты выбраны — открываем
  useEffect(() => {
    if (phase === "pick" && picked.length === need) later(() => setPhase("reveal"), reduce ? 80 : 720);
  }, [phase, picked.length, need, later, reduce]);

  // открываем карты по одной; бесплатная трактовка запрашивается сразу, чтобы ожидание совпало с анимацией,
  // платная — после оплаты
  useEffect(() => {
    if (phase !== "reveal") return;
    const paidSpread = sessionRef.current.price > 0;
    if (!paidSpread) void requestReading(picked.map((i) => order[i]));
    const step = reduce ? 0 : need > 3 ? 320 : 560;
    const first = reduce ? 0 : 280;
    for (let k = 0; k < need; k++) later(() => setRevealed(k + 1), first + k * step);
    // решаем в момент, когда карты открылись: сервер мог ответить, что бесплатные подсказки на сегодня кончились
    later(() => {
      const s = sessionRef.current;
      setPhase(s.price > 0 && !s.proof ? "pay" : "read");
    }, first + need * step + (reduce ? 0 : 520));
    // запускается один раз при переходе в фазу открытия
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // мягко подводим к трактовке или оплате, если они ниже экрана
  useEffect(() => {
    if (phase !== "read" && phase !== "pay") return;
    const el = readingRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.72) {
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [phase, reduce]);

  async function requestReading(cards: DrawnCard[], proof?: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    const session = sessionRef.current;
    const id = session.orderId && proof ? paidEntryId(session.orderId) : newEntryId();
    setEntryId(id);
    setStatus("streaming");
    // бесплатная подсказка засчитывается сразу; вернётся, только если трактовка не придёт по вине сайта
    const spentFree = session.free;
    if (spentFree) setFreeLeft(spendFreeReading());
    let givenBack = false;
    const giveFreeBack = () => {
      if (!spentFree || givenBack) return;
      givenBack = true;
      setFreeLeft(refundFreeReading());
      setNotices((n) => [...n, "Подсказка не засчитана: бесплатная попытка на сегодня осталась."]);
    };

    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: session.question,
          topicId: session.topicId,
          spreadId: session.spreadId,
          cards,
          payment: proof,
        }),
        signal: controller.signal,
      });
      if (res.status === 402) {
        const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (data?.code === "free_limit") {
          // сервер видит, что бесплатные подсказки с этого адреса на сегодня кончились: подсказка становится платной
          setFreeLeft(exhaustFreeReadings());
          sessionRef.current = { ...session, price: PRICES[session.spreadId], free: false };
        } else {
          // оплата не подтвердилась — старое подтверждение больше не годится
          if (session.orderId) {
            const p = findPending(session.orderId);
            if (p) savePending({ ...p, proof: undefined });
          }
          sessionRef.current = { ...session, proof: undefined };
        }
        setStatus("idle");
        setNotices([]);
        setPayNotice(data?.error ?? "Не удалось подтвердить оплату. Попробуйте оплатить ещё раз.");
        // если карты ещё открываются, к экрану оплаты переключит таймер открытия — не обрываем анимацию
        setPhase((p) => (p === "reveal" ? p : "pay"));
        return;
      }
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Сервер ответил ошибкой ${res.status}. Попробуйте ещё раз.`);
      }
      let failure: string | null = null;
      let fellBack = false;
      await readEvents(res.body, (event) => {
        if (event.type === "meta") setMode({ mode: event.mode, detail: event.detail });
        else if (event.type === "text") appendText(event.text);
        else if (event.type === "notice") setNotices((n) => [...n, event.text]);
        else if (event.type === "fallback") {
          // ИИ не ответил — подсказку возвращаем сразу, даже если посетитель уйдёт, не дочитав базовую трактовку
          fellBack = true;
          if (event.basic) setBasic(true);
          giveFreeBack();
        } else if (event.type === "payment") {
          const sum = formatRub(event.amount);
          setHeld(event.status === "held");
          setPaymentNote(
            event.status === "held"
              ? `${sum} заблокированы на карте, заказ № ${event.orderId}. Спишем их, когда трактовка будет готова.`
              : event.status === "captured"
                ? `Трактовка готова — ${sum} списаны, заказ № ${event.orderId}. Спасибо!`
                : `Оплата прошла: ${sum}, заказ № ${event.orderId}. Спасибо!`
          );
        } else if (event.type === "error") failure = event.text;
      });
      flushText();
      if (failure) throw new Error(failure);
      if (!textRef.current.trim()) throw new Error("Трактовка пришла пустой. Попробуйте сделать расклад ещё раз.");

      setStatus("done");
      if (proof && session.orderId) {
        // трактовка пришла — расклад больше не ждёт; если ИИ не ответил, оплату можно использовать снова
        if (fellBack) setRetryable(true);
        else removePending(session.orderId);
      }
      setSaved(
        addJournalEntry({
          id,
          createdAt: new Date().toISOString(),
          question: session.question,
          topicId: session.topicId,
          spreadId: session.spreadId,
          cards,
          text: textRef.current,
          ...(proof && session.orderId ? { payment: { orderId: session.orderId, amount: session.price } } : {}),
        })
      );
    } catch (err) {
      // посетитель сам ушёл посреди ответа — подсказка остаётся засчитанной
      if (controller.signal.aborted) return;
      flushText();
      setStatus("error");
      giveFreeBack();
      if (proof) setRetryable(true);
      const message =
        err instanceof TypeError
          ? "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
          : err instanceof Error
            ? err.message
            : "Не удалось получить трактовку.";
      setNotices((n) => [...n, message]);
    }
  }

  const plainText = () => {
    const s = sessionRef.current;
    const sp = SPREADS[s.spreadId];
    const cards = picked.map((fanIndex, k) => {
      const d = order[fanIndex];
      return `${sp.positions[k].title}: ${deck[d.id].name}${d.reversed ? " (перевёрнутая)" : ""}`;
    });
    return [
      s.question ? `Вопрос: ${s.question}` : "Общий расклад",
      `Расклад: ${sp.title} (${sp.cardsLabel})`,
      ...cards,
      "",
      toPlainText(textRef.current),
    ].join("\n");
  };

  const dialogDrawn = dialogSlot != null && picked[dialogSlot] != null ? order[picked[dialogSlot]] : null;
  const session = sessionRef.current;
  const sessionSpread = SPREADS[session.spreadId];

  return (
    <MotionConfig reducedMotion="user">
      <section
        ref={tableRef}
        className={styles.table}
        data-phase={phase}
        aria-labelledby={phase === "ask" ? "ask-title" : "session-title"}
      >
        <div className={`page ${styles.tableInner}`}>
          {phase !== "ask" && (
            <header className={styles.session}>
              <h1 id="session-title" className={styles.sessionQuestion}>
                {session.question ? `«${session.question}»` : "Что для меня важно сейчас?"}
              </h1>
              <p className={styles.sessionMeta}>
                <span>
                  {sessionSpread.title} · {sessionSpread.cardsLabel}
                </span>
                <button type="button" className={styles.editLink} onClick={newReading}>
                  Изменить вопрос
                </button>
              </p>
            </header>
          )}

          {phase === "ask" && (resume || lostNote) && (
            <div className={styles.resume} role="status">
              {resume ? (
                <>
                  <p>
                    {resume.proof ? "Оплаченный расклад ждёт трактовку" : "Оплата расклада не завершена, карты сохранены"}
                    {": "}
                    <span className={styles.resumeQuestion}>
                      «{resume.question || "Что для меня важно сейчас?"}»
                    </span>
                  </p>
                  <div className={styles.resumeActions}>
                    <button type="button" className="btn btn-primary" onClick={() => restore(resume, null)}>
                      {resume.proof ? "Открыть трактовку" : "Вернуться к раскладу"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => {
                        if (!resume.proof) removePending(resume.orderId);
                        setResume(null);
                      }}
                    >
                      Скрыть
                    </button>
                  </div>
                </>
              ) : (
                <p>{lostNote}</p>
              )}
            </div>
          )}

          <LayoutGroup>
            <div className={styles.deckZone}>
              <AnimatePresence mode="popLayout" initial={false}>
                {(phase === "ask" || phase === "shuffle") && (
                  <motion.div key="deck" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                    <DeckStack shuffling={phase === "shuffle"} onActivate={phase === "ask" ? () => start() : undefined} />
                  </motion.div>
                )}
                {phase === "pick" && (
                  <motion.div key="fan" className={styles.fanWrap} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
                    <Fan total={order.length} taken={picked} canPick={remaining > 0} onPick={pick} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {phase === "ask" && (
              <QuestionForm
                question={question}
                topicId={topicId}
                spreadId={spreadId}
                payments={payments}
                prices={prices}
                onQuestion={setQuestion}
                onTopic={setTopicId}
                onSpread={setSpreadId}
                onSubmit={() => start()}
              />
            )}

            {phase === "shuffle" && (
              <p className={styles.status} role="status">
                Колода перемешивается…
              </p>
            )}

            {phase === "pick" && (
              <div className={styles.pickBar}>
                <p className={styles.pickText} aria-live="polite">
                  {remaining > 0 ? (
                    <>
                      Выберите {picked.length ? "ещё " : ""}
                      <b>
                        {remaining} {cardsWord(remaining)}
                      </b>{" "}
                      — те, что откликаются
                    </>
                  ) : (
                    "Карты выбраны"
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={pickForMe}
                  disabled={remaining === 0 || autoPicking}
                >
                  Выбрать за меня
                </button>
              </div>
            )}

            {phase !== "ask" && (
              <motion.div layout="position" className={styles.spreadWrap}>
                <SpreadView
                  spreadId={session.spreadId}
                  deck={deck}
                  order={order}
                  picked={picked}
                  angles={angles}
                  revealed={revealed}
                  activeSlot={activeSlot}
                  onOpen={setDialogSlot}
                  onActivate={setActiveSlot}
                />
              </motion.div>
            )}
          </LayoutGroup>

          {phase === "reveal" && (
            <p className="visually-hidden" role="status">
              Карты открываются
            </p>
          )}

          {phase === "pay" && (
            <div ref={readingRef} className={styles.readingWrap}>
              <Paywall
                spreadId={session.spreadId}
                amount={session.price}
                test={payments.test}
                state={payState}
                notice={payNotice}
                onPay={() => void pay()}
              />
            </div>
          )}

          {phase === "read" && (
            <div ref={readingRef} className={styles.readingWrap}>
              <Interpretation
                text={text}
                status={status}
                notices={paymentNote ? [paymentNote, ...notices] : notices}
                mode={mode}
                spreadId={session.spreadId}
                cardCount={need}
                activeSlot={activeSlot}
                onActivate={setActiveSlot}
                entryId={entryId}
                saved={saved}
                plainText={plainText}
                onNewReading={newReading}
                retryable={retryable}
                basic={basic}
                paid={Boolean(session.proof)}
                onRetry={retryPaid}
                held={held}
                release={release}
                onRelease={() => void releasePaid()}
              />
            </div>
          )}
        </div>
      </section>

      <CardDialog
        card={dialogDrawn ? deck[dialogDrawn.id] : null}
        drawn={dialogDrawn}
        position={dialogSlot != null ? SPREADS[session.spreadId].positions[dialogSlot] : null}
        onClose={() => setDialogSlot(null)}
      />
    </MotionConfig>
  );
}
