"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiteCard } from "@/data/types";
import { SPREADS } from "@/data/spreads";
import { deleteJournalEntry, readJournal, updateJournalNote, type JournalEntry } from "@/lib/journal";
import { StaticCard } from "./TarotCard";
import { BlockView, parseReading } from "./reading/markdown-lite";
import styles from "@/app/dnevnik/dnevnik.module.css";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function JournalView({ deck }: { deck: LiteCard[] }) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);

  useEffect(() => {
    const load = () => setEntries(readJournal());
    load();
    window.addEventListener("journal-change", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("journal-change", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  if (entries === null) return <p className={styles.loading}>Открываю дневник…</p>;

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Здесь пока пусто. Сделайте первый расклад — он сохранится сюда автоматически, а к нему можно будет дописать свои мысли.</p>
        <Link href="/" className="btn btn-primary">
          Сделать расклад
        </Link>
      </div>
    );
  }

  return (
    <ol className={styles.list}>
      {entries.map((e) => (
        <Entry key={e.id} entry={e} deck={deck} />
      ))}
    </ol>
  );
}

function Entry({ entry, deck }: { entry: JournalEntry; deck: LiteCard[] }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(entry.note ?? "");
  const [savedNote, setSavedNote] = useState(false);
  const timer = useRef(0);
  const sections = useMemo(() => (open ? parseReading(entry.text) : []), [open, entry.text]);
  const spread = SPREADS[entry.spreadId];

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function onNote(value: string) {
    setNote(value);
    setSavedNote(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSavedNote(updateJournalNote(entry.id, value)), 450);
  }

  function remove() {
    if (window.confirm("Удалить этот расклад из дневника? Это действие нельзя отменить.")) deleteJournalEntry(entry.id);
  }

  return (
    <li className={styles.entry}>
      <div className={styles.entryHead}>
        <div className={styles.entryCards} aria-hidden="true">
          {entry.cards.slice(0, 5).map((c, i) => {
            const card = deck[c.id];
            return card ? <StaticCard key={i} slug={card.slug} name={card.name} reversed={c.reversed} width="46px" sizes="46px" alt="" /> : null;
          })}
          {entry.cards.length > 5 && <span className={styles.more}>+{entry.cards.length - 5}</span>}
        </div>
        <div className={styles.entryInfo}>
          <p className={styles.when}>
            <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>, {spread?.title ?? "расклад"}
          </p>
          <h2 className={styles.question}>{entry.question ? `«${entry.question}»` : "Что для меня важно сейчас?"}</h2>
          <p className={styles.cardNames}>
            {entry.cards
              .map((c) => (deck[c.id] ? `${deck[c.id].name}${c.reversed ? " (перевёрнутая)" : ""}` : ""))
              .join(", ")}
          </p>
          {entry.note && !open && <p className={styles.notePreview}>{entry.note}</p>}
          <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Свернуть" : "Перечитать расклад"}
          </button>
        </div>
      </div>

      {open && (
        <div className={styles.entryBody}>
          {sections.map((s, i) => (
            <section key={i} className={styles.entrySection}>
              {s.title && <h3>{s.title}</h3>}
              {s.blocks.map((b, j) => (
                <BlockView key={j} block={b} />
              ))}
            </section>
          ))}
          <label className={styles.noteLabel} htmlFor={`note-${entry.id}`}>
            Мои мысли
          </label>
          <textarea id={`note-${entry.id}`} className={styles.noteArea} value={note} onChange={(e) => onNote(e.target.value)} rows={4} />
          <div className={styles.entryFoot}>
            <span aria-live="polite">{savedNote ? "Сохранено" : ""}</span>
            <button type="button" className={styles.delete} onClick={remove}>
              Удалить расклад
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
