// POST /api/payments/cancel — посетитель отказался от оплаченной трактовки, которая так и не пришла.
// Картой — снимаем блокировку суммы, по СБП — возвращаем деньги. В запросе — подтверждение оплаты.
// У настоящего платёжного сервиса здесь будет отмена платежа или возврат через его API.

import { paymentsMode, releasePayment } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (paymentsMode() === "off") return Response.json({ error: "Оплата на сайте выключена." }, { status: 404 });

  let body: { proof?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const released = releasePayment(body.proof);
  if (!released) {
    return Response.json(
      { error: "Не удалось найти оплату. Напишите нам и укажите номер заказа — вернём деньги вручную." },
      { status: 400 },
    );
  }
  return Response.json(
    { orderId: released.order.id, amount: released.order.amount, result: released.result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
