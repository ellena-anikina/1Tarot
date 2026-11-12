"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { SPREAD_LIST, SPREADS, type SpreadId } from "@/data/spreads";
import { TOPICS, type Topic, type TopicId } from "@/data/topics";
import { QUESTION_MAX_LENGTH } from "@/lib/reading-protocol";
import styles from "./reading.module.css";

interface Props {
  question: string;
  topicId: TopicId | null;
  spreadId: SpreadId;
  onQuestion: (q: string) => void;
  onTopic: (t: TopicId | null) => void;
  onSpread: (s: SpreadId) => void;
  onSubmit: () => void;
}

const PRESETS = new Set(TOPICS.map((t) => t.question));

export function QuestionForm({ question, topicId, spreadId, onQuestion, onTopic, onSpread, onSubmit }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // поле растёт вместе с текстом
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [question]);

  function chooseTopic(topic: Topic) {
    if (topicId === topic.id) {
      onTopic(null);
      if (question === topic.question) onQuestion("");
      return;
    }
    onTopic(topic.id);
    // свой вопрос не трогаем — подставляем формулировку, только если поле пустое или в нём другая заготовка
    if (!question.trim() || PRESETS.has(question)) onQuestion(topic.question);
    if (topic.spread) onSpread(topic.spread);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    onSubmit();
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="question" id="ask-title" className={styles.ask}>
        О чём вы хотите спросить карты?
      </label>

      <textarea
        id="question"
        ref={textareaRef}
        className={styles.textarea}
        rows={1}
        maxLength={QUESTION_MAX_LENGTH}
        value={question}
        onChange={(e) => onQuestion(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Например: что мне важно понять о своей работе сейчас?"
        aria-describedby="question-hint"
        autoComplete="off"
        enterKeyHint="go"
      />
      <p id="question-hint" className={styles.hint}>
        Лучше всего работают открытые вопросы: «Что мне важно понять…», «Как мне…». Можно оставить поле пустым — карты
        покажут, что важно сейчас.
      </p>

      <div className={styles.topics} role="group" aria-label="Готовые темы">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.chip}
            aria-pressed={topicId === t.id}
            onClick={() => chooseTopic(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <fieldset className={styles.spreads}>
        <legend className="visually-hidden">Расклад</legend>
        {SPREAD_LIST.map((s) => (
          <label key={s.id} className={styles.spreadOption}>
            <input
              type="radio"
              name="spread"
              value={s.id}
              checked={spreadId === s.id}
              onChange={() => onSpread(s.id)}
              className="visually-hidden"
            />
            <SpreadGlyph id={s.id} />
            <span className={styles.spreadName}>{s.name}</span>
            <span className={styles.spreadSummary}>{s.summary}</span>
          </label>
        ))}
      </fieldset>
      <p className={styles.spreadNote} aria-live="polite">
        {SPREADS[spreadId].summary}
      </p>

      <button type="submit" className={`btn btn-primary ${styles.cta}`}>
        Перемешать колоду
      </button>
    </form>
  );
}

// Схема расклада: маленькие карты с рамкой — сразу видно, сколько карт и как они лягут.
function SpreadGlyph({ id }: { id: SpreadId }) {
  const card = (x: number, y: number, w: number, h: number, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx="1.2" />
      <line x1={x + w * 0.28} y1={y + h * 0.5} x2={x + w * 0.72} y2={y + h * 0.5} strokeWidth="0.9" />
    </g>
  );
  return (
    <svg className={styles.glyph} viewBox="0 0 48 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2">
      {id === "one" && card(18.5, 3, 11, 26, "one")}
      {id === "three" && [card(6, 6, 10, 20, "a"), card(19, 6, 10, 20, "b"), card(32, 6, 10, 20, "c")]}
      {id === "celtic" && [
        card(13.5, 1, 6, 9.4, "top"),
        card(13.5, 11.3, 6, 9.4, "core"),
        <rect key="cross" x="11.8" y="13" width="9.4" height="6" rx="1" />,
        card(13.5, 21.6, 6, 9.4, "bottom"),
        card(5.5, 11.3, 6, 9.4, "left"),
        card(21.5, 11.3, 6, 9.4, "right"),
        card(35, 0.5, 6, 7, "s4"),
        card(35, 8.4, 6, 7, "s3"),
        card(35, 16.3, 6, 7, "s2"),
        card(35, 24.2, 6, 7, "s1"),
      ]}
    </svg>
  );
}
