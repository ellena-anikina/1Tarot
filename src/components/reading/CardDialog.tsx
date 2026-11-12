"use client";

// Окно с описанием карты из расклада: ключевые слова в её положении, совет и ссылка на полное значение.

import { useEffect, useRef } from "react";
import type { DrawnCard, LiteCard } from "@/data/types";
import type { SpreadPosition } from "@/data/spreads";
import { StaticCard } from "@/components/TarotCard";
import styles from "./reading.module.css";

interface Props {
  card: LiteCard | null;
  drawn: DrawnCard | null;
  position: SpreadPosition | null;
  onClose: () => void;
}

export function CardDialog({ card, drawn, position, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = Boolean(card && drawn && position);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="card-dialog-title"
    >
      {card && drawn && position && (
        <div className={styles.dialogInner}>
          <StaticCard
            slug={card.slug}
            name={card.name}
            reversed={drawn.reversed}
            className={styles.dialogCard}
            sizes="(max-width: 560px) 60vw, 220px"
            eager
          />
          <div className={styles.dialogBody}>
            <p className={styles.dialogPos}>
              {position.title} — {position.hint}
            </p>
            <h2 id="card-dialog-title" className={styles.dialogName}>
              {card.name}
            </h2>
            {drawn.reversed && <p className={styles.dialogTag}>В перевёрнутом положении</p>}
            <ul className={styles.keywords} aria-label="Ключевые слова">
              {(drawn.reversed ? card.keywordsReversed : card.keywords).map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <p className={styles.dialogAdvice}>{card.advice}</p>
            <div className={styles.dialogLinks}>
              <a className="btn btn-quiet" href={`/karty/${card.slug}`} target="_blank" rel="noopener">
                Полное значение карты
              </a>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
          <button type="button" className={styles.dialogClose} onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </dialog>
  );
}
