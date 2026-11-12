"use client";

// Стол расклада: вопрос → перемешивание → выбор карт из веера → переворот → трактовка.

import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawnCard, LiteCard } from "@/data/types";
import { SPREADS, cardsWord, type SpreadId } from "@/data/spreads";
import type { TopicId } from "@/data/topics";
import { pickRandomIndexes, shuffleDeck } from "@/lib/deck";
import { addJournalEntry, newEntryId } from "@/lib/journal";
import type { ReadingEvent } from "@/lib/reading-protocol";
import { toPlainText } from "./markdown-lite";
import { DeckStack } from "./DeckStack";
import { Fan } from "./Fan";
import { SpreadView } from "./SpreadView";
import { QuestionForm } from "./QuestionForm";
import { Interpretation } from "./Interpretation";
import { CardDialog } from "./CardDialog";
import styles from "./reading.module.css";

type Phase = "ask" | "shuffle" | "pick" | "reveal" | "read";
type Status = "idle" | "streaming" | "done" | "error";

interface Session {
  question: string;
  topicId: TopicId | null;
  spreadId: SpreadId;
}

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

export function ReadingTable({ deck }: { deck: LiteCard[] }) {
  const reduce = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [topicId, setTopicId] = useState<TopicId | null>(null);
  const [spreadId, setSpreadId] = useState<SpreadId>("three");

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
  const sessionRef = useRef<Session>({ question: "", topicId: null, spreadId: "three" });

  const spread = SPREADS[spreadId];
  const need = spread.positions.length;
  const remaining = need - picked.length;

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
  }

  function start() {
    resetSession();
    sessionRef.current = { question: question.trim(), topicId, spreadId };
    setOrder(shuffleDeck());
    setPhase("shuffle");
    if ((tableRef.current?.getBoundingClientRect().top ?? 0) < 0) scrollToTable();
    later(() => setPhase("pick"), reduce ? 60 : 1550);
  }

  function newReading() {
    resetSession();
    setPhase("ask");
    requestAnimationFrame(scrollToTable);
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

  // открываем карты по одной; запрос трактовки уходит сразу, чтобы ожидание совпало с анимацией
  useEffect(() => {
    if (phase !== "reveal") return;
    void requestReading(picked.map((i) => order[i]));
    const step = reduce ? 0 : need > 3 ? 320 : 560;
    const first = reduce ? 0 : 280;
    for (let k = 0; k < need; k++) later(() => setRevealed(k + 1), first + k * step);
    later(() => setPhase("read"), first + need * step + (reduce ? 0 : 520));
    // запускается один раз при переходе в фазу открытия
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // мягко подводим к трактовке, если она ниже экрана
  useEffect(() => {
    if (phase !== "read") return;
    const el = readingRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.72) {
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [phase, reduce]);

  async function requestReading(cards: DrawnCard[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    const id = newEntryId();
    const session = sessionRef.current;
    setEntryId(id);
    setStatus("streaming");

    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...session, cards }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Сервер ответил ошибкой ${res.status}. Попробуйте ещё раз.`);
      }
      let failure: string | null = null;
      await readEvents(res.body, (event) => {
        if (event.type === "meta") setMode({ mode: event.mode, detail: event.detail });
        else if (event.type === "text") appendText(event.text);
        else if (event.type === "notice") setNotices((n) => [...n, event.text]);
        else if (event.type === "error") failure = event.text;
      });
      flushText();
      if (failure) throw new Error(failure);
      if (!textRef.current.trim()) throw new Error("Трактовка пришла пустой. Попробуйте сделать расклад ещё раз.");

      setStatus("done");
      setSaved(
        addJournalEntry({
          id,
          createdAt: new Date().toISOString(),
          question: session.question,
          topicId: session.topicId,
          spreadId: session.spreadId,
          cards,
          text: textRef.current,
        })
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      flushText();
      setStatus("error");
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
    return [s.question ? `Вопрос: ${s.question}` : "Общий расклад", `Расклад: ${sp.name}`, ...cards, "", toPlainText(textRef.current)].join(
      "\n"
    );
  };

  const dialogDrawn = dialogSlot != null && picked[dialogSlot] != null ? order[picked[dialogSlot]] : null;
  const session = sessionRef.current;

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
                <span>{SPREADS[session.spreadId].name}</span>
                <button type="button" className={styles.editLink} onClick={newReading}>
                  Изменить вопрос
                </button>
              </p>
            </header>
          )}

          <LayoutGroup>
            <div className={styles.deckZone}>
              <AnimatePresence mode="popLayout" initial={false}>
                {(phase === "ask" || phase === "shuffle") && (
                  <motion.div key="deck" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                    <DeckStack shuffling={phase === "shuffle"} onActivate={phase === "ask" ? start : undefined} />
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
                onQuestion={setQuestion}
                onTopic={setTopicId}
                onSpread={setSpreadId}
                onSubmit={start}
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

          {phase === "read" && (
            <div ref={readingRef} className={styles.readingWrap}>
              <Interpretation
                text={text}
                status={status}
                notices={notices}
                mode={mode}
                cardCount={need}
                activeSlot={activeSlot}
                onActivate={setActiveSlot}
                entryId={entryId}
                saved={saved}
                plainText={plainText}
                onNewReading={newReading}
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
