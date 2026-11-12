"use client";

// Экран оплаты: карты уже легли и открыты, их значения можно посмотреть бесплатно.
// Платная часть — персональная трактовка по вопросу. Цена была видна ещё при выборе расклада.

import { SPREADS, cardsWord, type SpreadId } from "@/data/spreads";
import { formatRub } from "@/config/pricing";
import styles from "./reading.module.css";

export interface PayState {
  status: "idle" | "creating" | "error";
  message?: string;
}

interface Props {
  spreadId: SpreadId;
  amount: number;
  /** тестовая оплата — деньги не списываются */
  test: boolean;
  state: PayState;
  /** почему снова экран оплаты: отменили, банк отклонил, не подтвердилось */
  notice: string | null;
  /** показать бесплатную подсказку одной картой как запасной вариант */
  freeAlternative: boolean;
  onPay: () => void;
  onFree: () => void;
}

export function Paywall({ spreadId, amount, test, state, notice, freeAlternative, onPay, onFree }: Props) {
  const spread = SPREADS[spreadId];
  const n = spread.positions.length;
  const creating = state.status === "creating";

  return (
    <section className={styles.paywall} aria-labelledby="paywall-title">
      <p className={styles.paywallEyebrow}>Карты легли</p>
      <h2 id="paywall-title" className={styles.paywallTitle}>
        Персональная трактовка
      </h2>
      <p className={styles.paywallLead}>{spread.promise}</p>
      <ul className={styles.paywallList}>
        <li>
          {n === 1
            ? "что карта говорит именно о вашем вопросе"
            : `разбор каждой из ${n} ${cardsWord(n, ["карты", "карт", "карт"])} в её позиции — применительно к вашему вопросу`}
        </li>
        <li>общая картина и конкретный совет</li>
        <li>вопрос для размышления — ответ можно записать в дневник</li>
      </ul>

      {notice && (
        <p className={styles.paywallNotice} role="status">
          {notice}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p className={styles.paywallNotice} role="alert">
          {state.message}
        </p>
      )}

      <button type="button" className={`btn btn-primary ${styles.payButton}`} onClick={onPay} disabled={creating}>
        {creating ? "Переходим к оплате…" : `Оплатить ${formatRub(amount)}`}
      </button>
      <p className={styles.payMeta}>СБП или банковской картой · чек придёт на почту</p>
      <p className={styles.payMeta}>
        Не пришла трактовка — деньги вернутся. При оплате картой сумма спишется только после трактовки.
      </p>
      {test && <p className={styles.payTest}>Сейчас оплата тестовая: деньги не списываются.</p>}

      <p className={styles.payFree}>Значения карт — бесплатно: нажмите на карту, чтобы прочитать о ней.</p>
      {freeAlternative && (
        <button type="button" className={styles.payAlt} onClick={onFree}>
          Или сделайте бесплатную подсказку одной картой
        </button>
      )}
    </section>
  );
}
