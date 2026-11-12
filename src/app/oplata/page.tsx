// /oplata — тестовая страница оплаты (PAYMENTS_MODE=mock). Изображает страницу платёжного сервиса:
// посетитель выбирает способ оплаты, «платит» и возвращается к раскладу. Деньги не списываются.
// Когда подключим настоящий сервис, посетитель будет уходить на его страницу, а эта перестанет открываться.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/config/site";
import { SPREADS } from "@/data/spreads";
import { paymentsMode, readOrder, returnUrl } from "@/lib/payments/server";
import { MockCheckout } from "./MockCheckout";
import styles from "./oplata.module.css";

export const metadata: Metadata = {
  title: "Оплата",
  robots: { index: false, follow: false },
};

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (paymentsMode() !== "mock") notFound();

  const { zakaz } = await searchParams;
  const token = typeof zakaz === "string" ? zakaz : "";
  const order = readOrder(token);

  if (!order || order.expired) {
    return (
      <div className={`page ${styles.wrap}`}>
        <section className={styles.panel}>
          <h1 className={styles.item}>{order ? "Ссылка на оплату устарела" : "Ссылка на оплату не работает"}</h1>
          <p className={styles.note}>Вернитесь к раскладу и нажмите «Оплатить» ещё раз — карты сохранены.</p>
          <Link href={order ? returnUrl(order.id, { status: "canceled" }) : "/"} className="btn btn-primary">
            Вернуться к раскладу
          </Link>
        </section>
      </div>
    );
  }

  const spread = SPREADS[order.spreadId];
  return (
    <div className={`page ${styles.wrap}`}>
      <MockCheckout
        token={token}
        orderId={order.id}
        amount={order.amount}
        merchant={SITE.name}
        item={`Персональная трактовка: «${spread.title}»`}
        itemDetail={spread.cardsLabel}
        cancelUrl={returnUrl(order.id, { status: "canceled" })}
        failUrl={returnUrl(order.id, { status: "failed" })}
      />
    </div>
  );
}
