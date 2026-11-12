// Оплата на сервере: режим, заказы и проверка оплаты.
//
// Сейчас работает тестовая оплата (PAYMENTS_MODE=mock): страница /oplata изображает платёжный сервис,
// деньги не списываются. Заказ и подтверждение оплаты — строки, подписанные сервером (HMAC): базы данных
// не нужно, а подделать оплату, не зная секрета, нельзя. Подтверждение привязано к конкретному раскладу —
// вопросу и выпавшим картам, поэтому одной оплатой нельзя открыть другой расклад.
//
// Деньги берутся только за пришедшую трактовку. Оплата картой — двухстадийная: сумма блокируется,
// а списывается (capturePayment), когда трактовка готова. СБП блокировать не умеет: деньги приходят сразу,
// а если трактовка не получилась, посетитель может их вернуть (releasePayment).
//
// Настоящий платёжный сервис (Робокасса, ЮKassa и т.п.) подключается здесь же:
// createPayment создаёт платёж у сервиса и возвращает адрес его страницы оплаты;
// checkPayment спрашивает у сервиса статус платежа и сверяет сумму и расклад;
// capturePayment и releasePayment — подтверждение блокировки, её отмена или возврат через API сервиса.
// У самозанятой при возврате нужно аннулировать чек в «Мой налог» с причиной «Возврат средств».

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SPREADS, isSpreadId, type SpreadId } from "@/data/spreads";
import type { ReadingRequest } from "@/lib/reading-protocol";
import { FREE_PER_DAY, FREE_SPREAD, PRICES, formatRub, type PaymentsInfo } from "@/config/pricing";
import { PAY_METHODS, isPayMethod, type PayMethod } from "./methods";

export type PaymentsMode = "off" | "mock";

let warned = false;

/** PAYMENTS_MODE: off — всё бесплатно; mock (по умолчанию) — тестовая оплата без денег. */
export function paymentsMode(): PaymentsMode {
  const raw = (process.env.PAYMENTS_MODE ?? "").trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw && raw !== "mock" && !warned) {
    warned = true;
    console.warn(`[payment] PAYMENTS_MODE=${raw}: такого режима пока нет, работает тестовая оплата (mock).`);
  }
  return "mock";
}

export function paymentsInfo(): PaymentsInfo {
  const mode = paymentsMode();
  return { enabled: mode !== "off", test: mode === "mock" };
}

// ---------- подписанные строки ----------

function secret(): string {
  // Для тестовой оплаты годится и запасной секрет; для настоящей задайте свой PAYMENTS_SECRET.
  return process.env.PAYMENTS_SECRET || "tarot-test-payments";
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function unsign(token: unknown): Record<string, unknown> | null {
  if (typeof token !== "string" || token.length > 2000) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------- заказы ----------

/** Сколько действует ссылка на оплату. */
const ORDER_TTL_MS = 60 * 60 * 1000;
/** Сколько можно открывать оплаченную трактовку (например, если связь оборвалась). */
const RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Order {
  /** номер заказа, например «K7Q3-M9XP» */
  id: string;
  spreadId: SpreadId;
  /** сумма в рублях */
  amount: number;
}

interface Signed extends Order {
  kind: "order" | "receipt";
  /** отпечаток расклада: вопрос, тема и выпавшие карты */
  reading: string;
  exp: number;
  method?: PayMethod;
}

/** Отпечаток расклада: та же оплата не откроет расклад с другим вопросом или другими картами. */
function fingerprint(req: ReadingRequest): string {
  const data = JSON.stringify([req.spreadId, req.topicId, req.question, req.cards.map((c) => [c.id, c.reversed])]);
  return createHash("sha256").update(data).digest("base64url").slice(0, 22);
}

const ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // без 0/O и 1/I, чтобы номер легко продиктовать

function newOrderId(): string {
  const chars = [...randomBytes(8)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function parseSigned(token: unknown, kind: Signed["kind"]): Signed | null {
  const d = unsign(token);
  if (!d || d.kind !== kind) return null;
  if (typeof d.id !== "string" || !isSpreadId(d.spreadId) || typeof d.amount !== "number") return null;
  if (typeof d.reading !== "string" || typeof d.exp !== "number") return null;
  return {
    kind,
    id: d.id,
    spreadId: d.spreadId,
    amount: d.amount,
    reading: d.reading,
    exp: d.exp,
    method: isPayMethod(d.method) ? d.method : undefined,
  };
}

/** Бесплатная подсказка: оплата не нужна, лимит считает браузер, а сервер страхует по адресу. */
export function isFreeReading(spreadId: SpreadId): boolean {
  return paymentsMode() !== "off" && spreadId === FREE_SPREAD && FREE_PER_DAY > 0;
}

/** Нужна ли оплата, чтобы открыть трактовку этого расклада. */
export function requiresPayment(spreadId: SpreadId): boolean {
  if (paymentsMode() === "off" || isFreeReading(spreadId)) return false;
  return PRICES[spreadId] > 0;
}

export interface CreatedPayment {
  orderId: string;
  amount: number;
  /** куда отправить посетителя платить: страница платёжного сервиса (сейчас — тестовая /oplata) */
  confirmationUrl: string;
}

/** Создаёт платёж за трактовку этого расклада. Сумму берём из настроек, а не из запроса. */
export function createPayment(req: ReadingRequest): CreatedPayment {
  const amount = PRICES[req.spreadId];
  const order: Signed = {
    kind: "order",
    id: newOrderId(),
    spreadId: req.spreadId,
    amount,
    reading: fingerprint(req),
    exp: Date.now() + ORDER_TTL_MS,
  };
  return { orderId: order.id, amount, confirmationUrl: `/oplata?zakaz=${sign(order)}` };
}

/** Заказ по ссылке на тестовую страницу оплаты. */
export function readOrder(token: unknown): (Order & { expired: boolean }) | null {
  const order = parseSigned(token, "order");
  if (!order) return null;
  return { id: order.id, spreadId: order.spreadId, amount: order.amount, expired: order.exp < Date.now() };
}

/** Куда вернуть посетителя после оплаты: на стол расклада, где он продолжится. */
export function returnUrl(orderId: string, outcome: { proof: string } | { status: "canceled" | "failed" }): string {
  const params = new URLSearchParams({ oplata: orderId });
  if ("proof" in outcome) params.set("proof", outcome.proof);
  else params.set("status", outcome.status);
  return `/?${params.toString()}`;
}

/** Тестовая оплата прошла: выдаём подтверждение, по которому сервер откроет трактовку. */
export function confirmMockPayment(token: unknown, method: PayMethod): { order: Order; proof: string } | null {
  const order = parseSigned(token, "order");
  if (!order || order.exp < Date.now()) return null;
  const receipt: Signed = { ...order, kind: "receipt", method, exp: Date.now() + RECEIPT_TTL_MS };
  const amount = formatRub(order.amount);
  // «Деньги получены» — в терминале сервера; у настоящего сервиса это будет его уведомление о платеже.
  console.info(
    PAY_METHODS[method].hold
      ? `[payment] Тестовая оплата картой: заказ ${order.id}, ${amount} заблокированы до трактовки («${SPREADS[order.spreadId].title}»)`
      : `[payment] Тестовая оплата прошла: заказ ${order.id}, ${amount}, ${PAY_METHODS[method].label} («${SPREADS[order.spreadId].title}»)`,
  );
  return { order: { id: order.id, spreadId: order.spreadId, amount: order.amount }, proof: sign(receipt) };
}

export interface PaidOrder extends Order {
  method: PayMethod;
  /** сумма только заблокирована и спишется, когда трактовка будет готова */
  held: boolean;
}

/** Трактовка пришла — списываем заблокированную сумму. У настоящего сервиса — его метод capture. */
export function capturePayment(order: PaidOrder): void {
  if (!order.held) return;
  console.info(`[payment] Трактовка готова, списано: заказ ${order.id}, ${formatRub(order.amount)}`);
}

/** Трактовка не получилась, и посетитель отказался от неё: снимаем блокировку или возвращаем деньги. */
export function releasePayment(proof: unknown): { order: PaidOrder; result: "canceled" | "refunded" } | null {
  const receipt = parseSigned(proof, "receipt");
  if (!receipt || receipt.exp < Date.now()) return null;
  const method = receipt.method ?? "sbp";
  const held = PAY_METHODS[method].hold;
  const order: PaidOrder = { id: receipt.id, spreadId: receipt.spreadId, amount: receipt.amount, method, held };
  console.info(
    held
      ? `[payment] Блокировка снята: заказ ${order.id}, ${formatRub(order.amount)}`
      : `[payment] Возврат: заказ ${order.id}, ${formatRub(order.amount)}, ${PAY_METHODS[method].label} — аннулировать чек в «Мой налог»`,
  );
  return { order, result: held ? "canceled" : "refunded" };
}

export type PaymentCheck =
  | { ok: true; paid: false }
  | { ok: true; paid: true; order: PaidOrder }
  | { ok: false; error: string };

/** Проверка перед трактовкой: платный расклад открывается только по подтверждению оплаты именно за него. */
export function checkPayment(req: ReadingRequest, proof: unknown): PaymentCheck {
  if (paymentsMode() === "off") return { ok: true, paid: false };
  const required = requiresPayment(req.spreadId);
  if (proof == null || proof === "") {
    return required ? { ok: false, error: "Этот расклад нужно оплатить." } : { ok: true, paid: false };
  }

  const receipt = parseSigned(proof, "receipt");
  let error: string | null = null;
  if (!receipt) error = "Не удалось подтвердить оплату. Попробуйте оплатить ещё раз.";
  else if (receipt.exp < Date.now()) error = "Срок, когда можно открыть эту трактовку, истёк.";
  else if (receipt.spreadId !== req.spreadId || receipt.reading !== fingerprint(req)) {
    error = "Оплата относится к другому раскладу.";
  }

  if (receipt && !error) {
    const method = receipt.method ?? "sbp";
    return {
      ok: true,
      paid: true,
      order: { id: receipt.id, spreadId: receipt.spreadId, amount: receipt.amount, method, held: PAY_METHODS[method].hold },
    };
  }
  return required ? { ok: false, error: error ?? "Этот расклад нужно оплатить." } : { ok: true, paid: false };
}
