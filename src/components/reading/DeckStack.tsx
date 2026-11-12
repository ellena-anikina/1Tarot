"use client";

// Колода на столе. Во время перемешивания половинки расходятся и снова сходятся.

import { motion } from "motion/react";
import styles from "./reading.module.css";

const LAYERS = 9;
const TILT = [-2.4, 1.5, -0.9, 2, -1.6, 0.7, -0.5, 1.2, 0];

interface Props {
  shuffling: boolean;
  /** клик по колоде — то же, что кнопка «Перемешать колоду» */
  onActivate?: () => void;
}

export function DeckStack({ shuffling, onActivate }: Props) {
  return (
    <div className={styles.deck} data-shuffling={shuffling || undefined}>
      <div className={styles.deckLift}>
        {Array.from({ length: LAYERS }, (_, i) => {
          const side = i % 2 === 0 ? -1 : 1;
          const restX = `${(i - 4) * 0.5}%`;
          const restY = `${-i * 0.65}%`;
          return (
            <motion.div
              key={i}
              className={styles.deckLayer}
              style={{ zIndex: i }}
              initial={false}
              animate={
                shuffling
                  ? {
                      x: [restX, `${side * 64}%`, restX, `${side * 40}%`, restX],
                      y: [restY, `${side > 0 ? -2 : 1}%`, restY, `${side > 0 ? -1 : 0.5}%`, restY],
                      rotate: [TILT[i], side * 8, TILT[i], side * 5, TILT[i]],
                    }
                  : { x: restX, y: restY, rotate: TILT[i] }
              }
              transition={
                shuffling
                  ? { duration: 1.35, times: [0, 0.26, 0.5, 0.76, 1], ease: "easeInOut", delay: i * 0.018 }
                  : { duration: 0.3 }
              }
            >
              <div className={styles.deckBack} />
            </motion.div>
          );
        })}
      </div>
      {onActivate && (
        <button type="button" className={styles.deckButton} onClick={onActivate} tabIndex={-1} aria-hidden="true" />
      )}
    </div>
  );
}
