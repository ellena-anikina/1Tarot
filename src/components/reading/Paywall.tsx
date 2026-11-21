"use client";

// Экран оплаты: карты уже легли и открыты. Платная часть — персональная трактовка по вопросу.
// Цена была видна ещё при выборе расклада. На экране только то, что помогает решиться:
// польза, кнопка и одна строка доверия — без ссылок, уводящих с экрана.
// Единственная ссылка — на оферту (её принимают оплатой); она открывается в новой вкладке.

import Link from "next/link";
import { SPREADS, type SpreadId } from "@/data/spreads";
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
  onPay: () => void;
}

export function Paywall({ spreadId, amount, test, state, notice, onPay }: Props) {
  const creating = state.status === "creating";

  return (
    <section className={styles.paywall} aria-labelledby="paywall-title">
      <p className={styles.paywallEyebrow}>Карты легли</p>
      <h2 id="paywall-title" className={styles.paywallTitle}>
        Персональная трактовка
      </h2>
      <p className={styles.paywallLead}>
        {SPREADS[spreadId].promise} В конце — совет и вопрос для размышления.
      </p>

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
      <p className={styles.payMeta}>СБП или карта · не пришла трактовка — вернём деньги</p>
      <p className={styles.payOffer}>
        Оплачивая, вы принимаете условия{" "}
        <Link href="/oferta" target="_blank" rel="noopener">
          оферты
        </Link>
        .
      </p>
      {test && <p className={styles.payTest}>Сейчас оплата тестовая: деньги не списываются.</p>}
    </section>
  );
}
