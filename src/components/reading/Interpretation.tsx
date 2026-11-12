"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { updateJournalNote } from "@/lib/journal";
import { BlockView, parseReading } from "./markdown-lite";
import styles from "./reading.module.css";

interface Props {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  notices: string[];
  mode: { mode: "ai" | "demo"; detail?: string } | null;
  cardCount: number;
  activeSlot: number | null;
  onActivate: (slot: number | null) => void;
  entryId: string | null;
  saved: boolean;
  plainText: () => string;
  onNewReading: () => void;
}

const isDev = process.env.NODE_ENV !== "production";

export function Interpretation({
  text,
  status,
  notices,
  mode,
  cardCount,
  activeSlot,
  onActivate,
  entryId,
  saved,
  plainText,
  onNewReading,
}: Props) {
  const sections = useMemo(() => parseReading(text), [text]);
  const streaming = status === "streaming";
  const done = status === "done" || status === "error";

  return (
    <div className={styles.reading} aria-busy={streaming}>
      {mode?.mode === "demo" && (
        <p className={styles.readingMeta}>
          {isDev && mode.detail
            ? `Демо-режим: ${mode.detail}. Сейчас трактовка собрана из описаний карт.`
            : "Трактовка составлена по классическим значениям карт."}
        </p>
      )}
      {isDev && mode?.mode === "ai" && mode.detail && <p className={styles.readingMeta}>Отвечает ИИ: {mode.detail}</p>}
      {notices.map((n, i) => (
        <p key={i} className={styles.notice} role="status">
          {n}
        </p>
      ))}

      {!text && streaming && <p className={styles.waiting}>Карты складываются в историю…</p>}

      {sections.map((section, i) => {
        const isCard = i < cardCount && section.title !== null;
        const kind =
          section.title === "Совет"
            ? styles.advice
            : section.title?.startsWith("Вопрос для размышления")
              ? styles.reflection
              : isCard
                ? styles.cardSection
                : "";
        const isLast = i === sections.length - 1;
        return (
          <section
            key={i}
            className={`${styles.section} ${kind}`}
            data-active={(isCard && activeSlot === i) || undefined}
            onMouseEnter={isCard ? () => onActivate(i) : undefined}
            onMouseLeave={isCard ? () => onActivate(null) : undefined}
          >
            {section.title && <h3 className={styles.sectionTitle}>{section.title}</h3>}
            <div className={styles.sectionText}>
              {section.blocks.map((block, b) => (
                <BlockView key={b} block={block} />
              ))}
              {streaming && isLast && <span className={styles.caret} aria-hidden="true" />}
            </div>
          </section>
        );
      })}

      {done && (
        <>
          <p className="visually-hidden" role="status">
            Трактовка готова
          </p>
          <AfterReading entryId={entryId} saved={saved} plainText={plainText} onNewReading={onNewReading} />
        </>
      )}
    </div>
  );
}

function AfterReading({
  entryId,
  saved,
  plainText,
  onNewReading,
}: Pick<Props, "entryId" | "saved" | "plainText" | "onNewReading">) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  function onNote(value: string) {
    setNote(value);
    setNoteSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (entryId && updateJournalNote(entryId, value)) setNoteSaved(true);
    }, 450);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.after}>
      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" onClick={onNewReading}>
          Новый расклад
        </button>
        {saved && entryId && (
          <button
            type="button"
            className="btn btn-quiet"
            aria-expanded={noteOpen}
            onClick={() => setNoteOpen((v) => !v)}
          >
            Записать мысли
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={copy}>
          {copied ? "Скопировано" : "Скопировать текст"}
        </button>
      </div>

      {noteOpen && (
        <div className={styles.noteBox}>
          <label htmlFor="reading-note" className={styles.noteLabel}>
            Что откликнулось? Запишите, пока свежо — через неделю будет интересно перечитать.
          </label>
          <textarea
            id="reading-note"
            ref={noteRef}
            className={styles.noteArea}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={4}
          />
          <p className={styles.noteStatus} aria-live="polite">
            {noteSaved ? "Сохранено в дневнике" : " "}
          </p>
        </div>
      )}

      {saved ? (
        <p className={styles.saved}>
          Расклад сохранён в <Link href="/dnevnik">дневнике</Link> — только на этом устройстве.
        </p>
      ) : (
        <p className={styles.saved}>Не удалось сохранить расклад в дневник: браузер запретил хранение данных.</p>
      )}
    </div>
  );
}
