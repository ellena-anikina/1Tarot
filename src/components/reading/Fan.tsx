"use client";

// Веер из всей колоды. Карту можно выбрать кликом, касанием, ведением пальца по колоде
// или с клавиатуры (стрелки + Enter). Выбранная карта улетает в расклад (общий layoutId).

import { motion } from "motion/react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import styles from "./reading.module.css";

interface Props {
  total: number;
  taken: number[];
  canPick: boolean;
  /** индекс в веере и угол наклона карты — чтобы полёт в расклад начался с того же наклона */
  onPick: (index: number, angle: number) => void;
}

export function Fan({ total, taken, canPick, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const takenSet = useMemo(() => new Set(taken), [taken]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    // форма с кнопкой исчезла — переводим фокус на веер, чтобы с клавиатуры можно было сразу выбирать
    if (!document.activeElement || document.activeElement === document.body) el.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, []);

  const geo = useMemo(() => {
    const W = Math.max(width, 280);
    const cw = Math.round(Math.min(72, Math.max(46, W * 0.074)));
    const ch = cw * 1.715;
    const R = W * (W < 640 ? 1 : 0.86);
    const half = W / 2 - cw / 2 - 8;
    const thetaMax = Math.asin(Math.min(0.97, half / R));
    const lift = Math.round(ch * 0.22) + 6;
    const sag = R * (1 - Math.cos(thetaMax));
    return { W, cw, ch, R, thetaMax, lift, height: Math.ceil(ch + sag + lift + 10) };
  }, [width]);

  const cards = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => {
        const theta = total === 1 ? 0 : -geo.thetaMax + (2 * geo.thetaMax * i) / (total - 1);
        return {
          i,
          deg: (theta * 180) / Math.PI,
          left: geo.W / 2 + geo.R * Math.sin(theta) - geo.cw / 2,
          top: geo.lift + geo.R * (1 - Math.cos(theta)),
        };
      }),
    [geo, total]
  );

  const nearestFree = (i: number): number | null => {
    for (let d = 0; d < total; d++) {
      if (i - d >= 0 && !takenSet.has(i - d)) return i - d;
      if (i + d < total && !takenSet.has(i + d)) return i + d;
    }
    return null;
  };

  const indexAt = (clientX: number): number | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const dx = clientX - rect.left - geo.W / 2;
    const theta = Math.asin(Math.max(-1, Math.min(1, dx / geo.R)));
    const raw = Math.round(((theta + geo.thetaMax) / (2 * geo.thetaMax)) * (total - 1));
    return nearestFree(Math.max(0, Math.min(total - 1, raw)));
  };

  const pick = (i: number | null) => {
    if (i == null || !canPick || takenSet.has(i)) return;
    onPick(i, cards[i].deg);
  };

  const step = (from: number, dir: 1 | -1): number | null => {
    for (let k = from; k >= 0 && k < total; k += dir) if (!takenSet.has(k)) return k;
    return null;
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = hover ?? nearestFree(Math.floor(total / 2));
    if (current == null) return;
    let next: number | null = current;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = step(current + 1, 1) ?? current;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = step(current - 1, -1) ?? current;
    else if (e.key === "Home") next = step(0, 1);
    else if (e.key === "End") next = step(total - 1, -1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(current);
      setHover(step(current + 1, 1) ?? step(current - 1, -1));
      return;
    } else return;
    e.preventDefault();
    setHover(next);
  }

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      pressed.current = true;
      setHover(indexAt(e.clientX));
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      if (e.pointerType === "mouse" || pressed.current) setHover(indexAt(e.clientX));
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (!pressed.current) return;
      pressed.current = false;
      pick(indexAt(e.clientX));
      if (e.pointerType !== "mouse") setHover(null);
    },
    onPointerCancel() {
      pressed.current = false;
      setHover(null);
    },
    onPointerLeave() {
      if (!pressed.current) setHover(null);
    },
  };

  return (
    <div
      ref={ref}
      className={styles.fan}
      style={{ height: geo.height }}
      role="listbox"
      tabIndex={0}
      aria-label="Колода. Стрелками выберите карту, клавишей Enter возьмите её"
      aria-activedescendant={hover != null ? `fan-card-${hover}` : undefined}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) setHover((h) => h ?? nearestFree(Math.floor(total / 2)));
      }}
      onBlur={() => setHover(null)}
      {...handlers}
    >
      {width > 0 &&
        cards.map((c) =>
          takenSet.has(c.i) ? null : (
            <motion.div
              key={c.i}
              id={`fan-card-${c.i}`}
              role="option"
              aria-selected={false}
              aria-label={`Карта ${c.i + 1}`}
              layoutId={`deck-${c.i}`}
              className={styles.fanCard}
              data-hover={hover === c.i || undefined}
              style={{ left: c.left, top: c.top, width: geo.cw, height: geo.ch, zIndex: c.i }}
            >
              <motion.div
                className={styles.fanTilt}
                initial={{ x: geo.W / 2 - geo.cw / 2 - c.left, y: -c.top, rotate: 0, opacity: 0 }}
                animate={{ x: 0, y: 0, rotate: c.deg, opacity: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 22, delay: c.i * 0.007 }}
              >
                <div className={styles.fanLift}>
                  <div className={styles.fanBack} />
                </div>
              </motion.div>
            </motion.div>
          )
        )}
    </div>
  );
}
