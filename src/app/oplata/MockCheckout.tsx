"use client";

// Тестовая страница оплаты: выбор способа, почта для чека, «оплата» и возврат к раскладу.
// Поля для данных карты нарочно нет: на тестовой странице не нужно вводить ничего настоящего.

import { useEffect, useRef, useState } from "react";
import { formatRub } from "@/config/pricing";
import { PAY_METHODS, type PayMethod } from "@/lib/payments/methods";
import styles from "./oplata.module.css";

interface Props {
  token: string;
  orderId: string;
  amount: number;
  merchant: string;
  item: string;
  itemDetail: string;
  cancelUrl: string;
  failUrl: string;
}

type Step = "form" | "processing" | "paid" | "failed";

const METHOD_IDS = Object.keys(PAY_METHODS) as PayMethod[];

export function MockCheckout({ token, orderId, amount, merchant, item, itemDetail, cancelUrl, failUrl }: Props) {
  const [method, setMethod] = useState<PayMethod>("sbp");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    if (step === "paid" || step === "failed") resultRef.current?.focus();
  }, [step]);

  const wait = (ms: number) => new Promise<void>((resolve) => timers.current.push(window.setTimeout(resolve, ms)));

  async function pay(outcome: "paid" | "failed") {
    setError(null);
    setStep("processing");
    // как будто ждём ответа банка
    await wait(1300);
    if (outcome === "failed") {
      setStep("failed");
      return;
    }
    try {
      const res = await fetch("/api/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zakaz: token, method }),
      });
      const data = (await res.json().catch(() => null)) as { returnUrl?: string; error?: string } | null;
      if (!res.ok || !data?.returnUrl) throw new Error(data?.error ?? `Сервер ответил ошибкой ${res.status}.`);
      const url = data.returnUrl;
      setNext(url);
      setStep("paid");
      timers.current.push(window.setTimeout(() => window.location.assign(url), 2600));
    } catch (err) {
      setStep("form");
      setError(
        err instanceof TypeError
          ? "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
          : err instanceof Error
            ? err.message
            : "Не удалось провести оплату.",
      );
    }
  }

  return (
    <div className={styles.checkout}>
      <p className={styles.testBanner} role="note">
        <b>Тестовая оплата — деньги не списываются.</b> Так будет выглядеть шаг оплаты: здесь откроется страница
        платёжного сервиса, где вы выберете способ и подтвердите платёж.
      </p>

      <section className={styles.panel} aria-labelledby="pay-title">
        <div className={styles.orderHead}>
          <span>{merchant}</span>
          <span>Заказ № {orderId}</span>
        </div>
        <h1 id="pay-title" className={styles.item}>
          {item}
        </h1>
        <p className={styles.itemDetail}>{itemDetail}</p>
        <p className={styles.amount}>{formatRub(amount)}</p>

        {step === "form" && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void pay("paid");
            }}
          >
            <fieldset className={styles.methods}>
              <legend className={styles.label}>Способ оплаты</legend>
              {METHOD_IDS.map((id) => (
                <label key={id} className={styles.method}>
                  <input type="radio" name="method" value={id} checked={method === id} onChange={() => setMethod(id)} />
                  <span>
                    <span className={styles.methodName}>{PAY_METHODS[id].label}</span>
                    <span className={styles.methodHint}>{PAY_METHODS[id].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="receipt-email">
                Почта для чека
              </label>
              <input
                id="receipt-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.ru"
                aria-describedby="receipt-hint"
              />
              <p id="receipt-hint" className={styles.hint}>
                Сюда придёт чек: самозанятые выдают его через «Мой налог». В тестовом режиме почта никуда не уходит —
                поле можно оставить пустым.
              </p>
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button type="submit" className={`btn btn-primary ${styles.payButton}`}>
              Оплатить {formatRub(amount)}
            </button>
            <a href={cancelUrl} className={`btn btn-quiet ${styles.payButton}`}>
              Отказаться и вернуться к раскладу
            </a>

            <p className={styles.testTools}>
              Для проверки другого исхода:{" "}
              <button type="button" onClick={() => void pay("failed")}>
                банк отклонил платёж
              </button>
            </p>
          </form>
        )}

        {step === "processing" && (
          <p className={styles.processing} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            Ждём подтверждения банка…
          </p>
        )}

        {step === "paid" && next && (
          <div ref={resultRef} tabIndex={-1} className={styles.result} role="status">
            <p className={styles.resultTitle}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.check}>
                <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {PAY_METHODS[method].hold ? "Сумма заблокирована" : "Оплата прошла"}
            </p>
            <p>
              {PAY_METHODS[method].hold
                ? `${formatRub(amount)} заблокированы на карте. Спишем их, когда трактовка будет готова; если она не придёт, блокировка снимется.`
                : `${formatRub(amount)} получены — спасибо! Если трактовка не придёт, деньги вернутся.`}{" "}
              {`В настоящей оплате чек придёт на ${email.trim() || "почту"}${PAY_METHODS[method].hold ? " после списания" : ""}.`}
            </p>
            <p className={styles.hint}>Возвращаемся к раскладу — трактовка начнёт писаться сразу.</p>
            <a href={next} className="btn btn-primary">
              Вернуться к раскладу
            </a>
          </div>
        )}

        {step === "failed" && (
          <div ref={resultRef} tabIndex={-1} className={styles.result} role="alert">
            <p className={styles.resultTitle}>Банк отклонил платёж</p>
            <p>Деньги не списаны. Попробуйте ещё раз или выберите другой способ оплаты.</p>
            <div className={styles.resultActions}>
              <button type="button" className="btn btn-primary" onClick={() => setStep("form")}>
                Попробовать ещё раз
              </button>
              <a href={failUrl} className="btn btn-quiet">
                Вернуться к раскладу
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
