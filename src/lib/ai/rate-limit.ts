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

// Запасная защита бесплатной подсказки: основной лимит («раз в день») считает браузер, но его можно обойти,
// открыв сайт в другом браузере или в режиме инкогнито. Сервер пропускает не больше FREE_PER_IP_PER_DAY
// бесплатных подсказок за сутки с одного адреса. Не 1, а 3 по умолчанию: под одним адресом бывают
// семья в одной сети Wi-Fi или соседи у мобильного оператора. 0 — проверка выключена.

const freeHits = new Map<string, number[]>();
const DAY_MS = 24 * 60 * 60 * 1000;

export function freePerAddressPerDay(): number {
  const raw = process.env.FREE_PER_IP_PER_DAY;
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
}

export function allowFreeReading(key: string): boolean {
  const limit = freePerAddressPerDay();
  if (limit === 0) return true;
  const now = Date.now();
  const recent = (freeHits.get(key) ?? []).filter((t) => now - t < DAY_MS);
  if (recent.length >= limit) {
    freeHits.set(key, recent);
    return false;
  }
  recent.push(now);
  freeHits.set(key, recent);
  if (freeHits.size > 5000) {
    for (const [k, times] of freeHits) if (!times.some((t) => now - t < DAY_MS)) freeHits.delete(k);
  }
  return true;
}
