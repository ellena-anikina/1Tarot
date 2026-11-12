// Цены раскладов. Меняются здесь — и только здесь.
// Платят только за персональную трактовку: перемешать колоду, вытянуть карты и прочитать их значения можно бесплатно.
// Включить или выключить оплату — переменная PAYMENTS_MODE в .env.local (см. README, раздел «Оплата»).

import type { SpreadId } from "@/data/spreads";

/** Цена персональной трактовки в рублях. */
export const PRICES: Record<SpreadId, number> = {
  /** одна карта сверх бесплатных на сегодня */
  one: 99,
  three: 199,
  celtic: 499,
};

/** Бесплатный расклад: какой и сколько раз в день на одном устройстве. 0 — бесплатных раскладов нет. */
export const FREE_SPREAD: SpreadId = "one";
export const FREE_PER_DAY: number = 1;

/** Расклад, который выбран сразу и помечен «Чаще выбирают». */
export const FEATURED_SPREAD: SpreadId = "three";

/** Что знает о режиме оплаты страница. */
export interface PaymentsInfo {
  /** false — оплата выключена, все расклады бесплатны */
  enabled: boolean;
  /** тестовая оплата: деньги не списываются */
  test: boolean;
}

/** Сколько стоит трактовка расклада прямо сейчас. 0 — бесплатно. */
export function priceOf(spreadId: SpreadId, payments: PaymentsInfo, freeLeft: number): number {
  if (!payments.enabled) return 0;
  if (spreadId === FREE_SPREAD && FREE_PER_DAY > 0 && freeLeft > 0) return 0;
  return PRICES[spreadId];
}

/** «199 ₽», «1 990 ₽» — с неразрывными пробелами, чтобы цена не переносилась. */
export function formatRub(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}
