"use client";

// Стол с позициями расклада. Пустые места показывают, куда ляжет карта;
// выбранные карты прилетают из веера и переворачиваются по очереди.

import { AnimatePresence, motion } from "motion/react";
import type { DrawnCard, LiteCard } from "@/data/types";
import { SPREADS, type SpreadId } from "@/data/spreads";
import { FlipCard } from "@/components/FlipCard";
import styles from "./reading.module.css";

interface Props {
  spreadId: SpreadId;
  deck: LiteCard[];
  order: DrawnCard[];
  picked: number[];
  angles: Record<number, number>;
  revealed: number;
  activeSlot: number | null;
  onOpen: (slot: number) => void;
  onActivate: (slot: number | null) => void;
}

const SIZES: Record<SpreadId, string> = {
  one: "(max-width: 600px) 44vw, 220px",
  three: "(max-width: 700px) 27vw, 186px",
  celtic: "(max-width: 860px) 11vw, 94px",
};

export function SpreadView(props: Props) {
  const { spreadId } = props;
  const slot = (index: number) => <Slot key={index} index={index} {...props} />;

  if (spreadId === "celtic") {
    return (
      <div className={styles.spread} data-spread="celtic">
        <div className={styles.celtic}>
          <div className={styles.cross}>
            {[0, 1, 2, 3, 4, 5].map((s) => (
              <div key={s} className={styles[`c${s + 1}`]}>
                {slot(s)}
              </div>
            ))}
          </div>
          <div className={styles.staff}>
            {[6, 7, 8, 9].map((s) => (
              <div key={s} className={styles[`c${s + 1}`]}>
                {slot(s)}
              </div>
            ))}
          </div>
        </div>
        <Legend {...props} />
      </div>
    );
  }

  return (
    <div className={styles.spread} data-spread={spreadId}>
      <div className={styles.row}>{SPREADS[spreadId].positions.map((_, s) => slot(s))}</div>
    </div>
  );
}

function Slot({ index, spreadId, deck, order, picked, angles, revealed, activeSlot, onOpen, onActivate }: Props & { index: number }) {
  const position = SPREADS[spreadId].positions[index];
  const fanIndex = picked[index];
  const drawn = fanIndex != null ? order[fanIndex] : null;
  const card = drawn ? deck[drawn.id] : null;
  const isRevealed = revealed > index;
  const crossing = spreadId === "celtic" && index === 1;
  const compact = spreadId === "celtic";

  return (
    <div
      className={styles.slot}
      onMouseEnter={() => isRevealed && onActivate(index)}
      onMouseLeave={() => onActivate(null)}
    >
      <div className={`${styles.slotBox} ${crossing ? styles.crossing : ""}`}>
        {!card && (
          <div className={styles.slotEmpty}>
            <span className={styles.slotNumber}>{index + 1}</span>
          </div>
        )}
        {card && drawn && (
          <motion.div layoutId={`deck-${fanIndex}`} className={styles.slotCard} style={{ zIndex: crossing ? 4 : 2 }}>
            <motion.div
              className={styles.slotTilt}
              initial={{ rotate: angles[fanIndex] ?? 0 }}
              animate={{ rotate: crossing ? 90 : 0 }}
            >
              <FlipCard
                slug={card.slug}
                name={card.name}
                reversed={drawn.reversed}
                flipped={isRevealed}
                active={activeSlot === index}
                sizes={SIZES[spreadId]}
                label={`${position.title}: ${card.name}${drawn.reversed ? ", перевёрнутая" : ""}. Открыть описание карты`}
                onOpen={() => onOpen(index)}
              />
            </motion.div>
          </motion.div>
        )}
      </div>

      {!compact && (
        <div className={styles.slotLabel}>
          <span className={styles.slotPos}>{position.title}</span>
          <AnimatePresence>
            {isRevealed && card && (
              <motion.span
                className={styles.slotName}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
              >
                {card.name}
                {drawn?.reversed && <span className={styles.slotReversed}>перевёрнутая</span>}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Legend({ spreadId, deck, order, picked, revealed, activeSlot, onActivate, onOpen }: Props) {
  return (
    <ol className={styles.legend}>
      {SPREADS[spreadId].positions.map((position, s) => {
        const fanIndex = picked[s];
        const drawn = fanIndex != null ? order[fanIndex] : null;
        const card = drawn && revealed > s ? deck[drawn.id] : null;
        return (
          <li
            key={s}
            data-active={activeSlot === s || undefined}
            onMouseEnter={() => card && onActivate(s)}
            onMouseLeave={() => onActivate(null)}
          >
            <span className={styles.legendNum}>{s + 1}</span>
            <span>
              <span className={styles.legendPos}>{position.title}</span>
              {card ? (
                <button type="button" className={styles.legendCard} onClick={() => onOpen(s)}>
                  {card.name}
                  {drawn?.reversed ? " (перевёрнутая)" : ""}
                </button>
              ) : (
                <span className={styles.legendWait}>{position.hint}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
