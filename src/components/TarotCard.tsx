// Карта Таро: иллюстрация 1909 года в рамке, которую рисует сайт, и русская подпись на плашке.
// Этот файл без анимаций — его используют серверные страницы (списки, страницы карт).

import type { CSSProperties } from "react";
import { cardImage } from "@/data/types";
import styles from "./TarotCard.module.css";

interface FaceProps {
  slug: string;
  name: string;
  reversed?: boolean;
  /** загрузить сразу, не откладывая (карта на первом экране или в раскладе) */
  eager?: boolean;
  /** подсказка браузеру, какой ширины будет карта — чтобы выбрать 320 или 640 */
  sizes?: string;
  /** подпись для скринридеров; пустая строка — изображение декоративное */
  alt?: string;
}

export function CardFace({ slug, name, reversed, eager, sizes = "180px", alt }: FaceProps) {
  return (
    <div className={styles.frame} data-reversed={reversed || undefined}>
      <img
        className={styles.art}
        src={cardImage(slug, 320)}
        srcSet={`${cardImage(slug, 320)} 320w, ${cardImage(slug, 640)} 640w`}
        sizes={sizes}
        width={640}
        height={1054}
        alt={alt ?? `Карта Таро «${name}»${reversed ? " в перевёрнутом положении" : ""}`}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
      <span className={styles.caption} aria-hidden="true">
        {name}
      </span>
    </div>
  );
}

interface StaticCardProps extends FaceProps {
  /** ширина карты, например "200px" или "100%" */
  width?: string;
  className?: string;
}

/** Карта лицом вверх, без анимации. */
export function StaticCard({ width, className, ...face }: StaticCardProps) {
  return (
    <div className={`${styles.card} ${className ?? ""}`} style={width ? ({ "--card-w": width } as CSSProperties) : undefined}>
      <div className={`${styles.face} ${styles.front}`}>
        <CardFace {...face} />
      </div>
    </div>
  );
}

/** Рубашка карты. */
export function CardBack({ width, className }: { width?: string; className?: string }) {
  return (
    <div className={`${styles.card} ${className ?? ""}`} style={width ? ({ "--card-w": width } as CSSProperties) : undefined}>
      <div className={`${styles.face} ${styles.back}`} />
    </div>
  );
}
