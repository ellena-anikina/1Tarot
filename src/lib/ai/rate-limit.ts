// Простое ограничение частоты: сколько ИИ-трактовок в час можно получить с одного адреса.
// Защищает бюджет API-ключа. Хранится в памяти процесса — для одного сервера этого достаточно;
// при масштабировании на несколько серверов замените на общее хранилище (например, Redis).

const hits = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;

export function readingsPerHour(): number {
  const n = Number(process.env.READINGS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function allowReading(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= readingsPerHour()) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // изредка чистим старые записи, чтобы карта не росла бесконечно
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return true;
}
