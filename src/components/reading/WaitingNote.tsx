"use client";

// Ожидание трактовки: анимированный знак и фразы, которые сменяют друг друга.
// Фраза о том, сколько ждать, чередуется с короткими мыслями об интуиции — в духе саморефлексии, без предсказаний.

import { useEffect, useState } from "react";
import type { SpreadId } from "@/data/spreads";
import styles from "./reading.module.css";

const PHRASE_MS = 5200;

// Точку в конце фраз не ставим — так они легче читаются; вопросительный знак остаётся.
const WAIT_PHRASE: Record<SpreadId, string> = {
  one: "Трактовка обычно готова меньше чем за минуту — подождите, пожалуйста",
  three: "Трактовка обычно готова меньше чем за минуту — подождите, пожалуйста",
  celtic: "Глубокий разбор может занимать до минуты — подождите, пожалуйста",
};

const THOUGHTS = [
  "Пока карты складываются, прислушайтесь к себе: какое чувство пришло первым?",
  "Интуиция говорит тихо. Дайте ей минуту — и вы её услышите",
  "Знаки вокруг нас всегда есть. Замечаем мы те, к которым готовы",
  "Карты не решают за вас — они помогают увидеть то, что вы уже чувствуете",
  "Ответ часто приходит образом, а не словами. Какая карта откликнулась сильнее?",
  "Совпадения — приглашение присмотреться внимательнее",
  "Сделайте глубокий вдох. Ясность приходит, когда мы замедляемся",
  "Каждая карта — зеркало. Что вы видите в нём сегодня?",
  "Доверяйте себе: лучше всех вашу жизнь читаете вы сами",
  "Знаки Вселенной легче заметить, когда вы открыты новому",
];

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function WaitingNote({ spreadId }: { spreadId: SpreadId }) {
  const wait = WAIT_PHRASE[spreadId];
  const [thoughts] = useState(() => shuffled(THOUGHTS));
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((s) => s + 1), PHRASE_MS);
    return () => window.clearInterval(timer);
  }, []);

  // чётные шаги — сколько ждать, нечётные — мысль об интуиции
  const phrase = step % 2 === 0 ? wait : thoughts[((step - 1) / 2) % thoughts.length];

  return (
    <div className={styles.waiting}>
      <svg className={styles.loader} viewBox="0 0 48 48" aria-hidden="true">
        <circle className={styles.loaderRing} cx="24" cy="24" r="17" />
        <g className={styles.loaderOrbit}>
          <path className={styles.loaderStar} d="M24 1.5Q24 7 29.5 7Q24 7 24 12.5Q24 7 18.5 7Q24 7 24 1.5Z" />
        </g>
        <path className={styles.loaderCore} d="M24 16Q24 24 32 24Q24 24 24 32Q24 24 16 24Q24 24 24 16Z" />
      </svg>
      <p className={styles.waitingTitle} role="status">
        Карты складываются в историю…<span className="visually-hidden"> {wait}.</span>
      </p>
      <p key={step} className={styles.waitingPhrase} aria-hidden="true">
        {phrase}
      </p>
    </div>
  );
}
