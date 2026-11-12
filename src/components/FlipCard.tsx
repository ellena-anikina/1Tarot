"use client";

// Карта в раскладе: лежит рубашкой вверх и переворачивается, когда приходит её очередь.

import { motion } from "motion/react";
import { CardFace } from "./TarotCard";
import styles from "./TarotCard.module.css";

interface Props {
  slug: string;
  name: string;
  reversed: boolean;
  flipped: boolean;
  active?: boolean;
  sizes?: string;
  label: string;
  onOpen?: () => void;
}

export function FlipCard({ slug, name, reversed, flipped, active, sizes, label, onOpen }: Props) {
  return (
    <div className={`${styles.card} ${styles.flipCard}`} data-active={active || undefined}>
      <motion.div
        className={styles.flipper}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 17, mass: 0.9 }}
      >
        <div className={`${styles.face} ${styles.back}`} />
        <div className={`${styles.face} ${styles.front} ${styles.frontFlipped}`}>
          <CardFace slug={slug} name={name} reversed={reversed} eager sizes={sizes} alt="" />
        </div>
      </motion.div>
      {onOpen && (
        <button type="button" className={styles.hit} onClick={onOpen} disabled={!flipped} aria-label={label} />
      )}
    </div>
  );
}
