// POST /api/payments/mock — «оплата прошла» на тестовой странице оплаты. Работает только при PAYMENTS_MODE=mock.
// Возвращает адрес, по которому посетитель вернётся к раскладу с подтверждением оплаты.
// Строка «[payment] …» в терминале сервера — тестовое «деньги получены» (пишет confirmMockPayment).

import { isPayMethod } from "@/lib/payments/methods";
import { confirmMockPayment, paymentsMode, returnUrl } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (paymentsMode() !== "mock") return Response.json({ error: "Тестовая оплата выключена." }, { status: 404 });

  let body: { zakaz?: unknown; method?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const method = isPayMethod(body.method) ? body.method : "sbp";
  const result = confirmMockPayment(body.zakaz, method);
  if (!result) {
    return Response.json(
      { error: "Ссылка на оплату устарела. Вернитесь к раскладу и нажмите «Оплатить» ещё раз." },
      { status: 400 },
    );
  }

  const { order, proof } = result;
  return Response.json({ orderId: order.id, returnUrl: returnUrl(order.id, { proof }) }, { headers: { "Cache-Control": "no-store" } });
}
