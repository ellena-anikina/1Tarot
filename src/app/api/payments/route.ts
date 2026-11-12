// POST /api/payments — оплатить трактовку расклада. В запросе — тот же расклад, что уйдёт на трактовку
// (вопрос, тема, карты); в ответе — номер заказа, сумма и адрес страницы оплаты.
// Сумму сервер берёт из src/config/pricing.ts, а не из запроса.

import { PRICES } from "@/config/pricing";
import { parseReadingRequest } from "@/lib/reading-protocol";
import { createPayment, paymentsMode } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (paymentsMode() === "off") return Response.json({ error: "Оплата на сайте выключена." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = parseReadingRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (PRICES[parsed.value.spreadId] <= 0) return Response.json({ error: "Этот расклад бесплатный." }, { status: 400 });

  return Response.json(createPayment(parsed.value), { headers: { "Cache-Control": "no-store" } });
}
