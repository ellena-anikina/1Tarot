// Готовит изображения карт для сайта из сканов колоды Райдера–Уэйта (1909, общественное достояние).
//
//   npm run cards:prepare                 — скачать сканы с Wikimedia Commons и обработать
//   npm run cards:prepare -- --src <dir>  — взять уже скачанные сканы (<dir>/<id>.jpg)
//
// Что делает: находит на скане чёрную рамку и (у старших арканов, тузов и придворных карт)
// плашку с английской подписью, вырезает только иллюстрацию, приводит все карты к одному
// формату и сохраняет WebP двух размеров в public/cards/{640,320}/<slug>.webp.
// Рамку и русскую подпись рисует сам сайт (см. src/components/TarotCard.module.css).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deck = JSON.parse(await fs.readFile(path.join(root, "src/data/deck.json"), "utf8"));

const args = process.argv.slice(2);
const srcArg = args.indexOf("--src");
const srcDir = srcArg >= 0 ? path.resolve(args[srcArg + 1]) : path.join(root, ".cache/rws-raw");
const outDir = path.join(root, "public/cards");
const SIZES = [640, 320];
const DARK = 100; // порог «чёрного» пикселя (0–255)

await fs.mkdir(srcDir, { recursive: true });
for (const size of SIZES) await fs.mkdir(path.join(outDir, String(size)), { recursive: true });

// ---------- 1. Скачивание недостающих сканов ----------
const UA = "TarotSiteBuilder/1.0 (cards:prepare script)";
for (const card of deck) {
  const file = path.join(srcDir, `${card.id}.jpg`);
  try {
    await fs.access(file);
    continue;
  } catch {}
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(card.source)}?width=960`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`Не удалось скачать ${card.source}: HTTP ${res.status}`);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`скачано: ${card.source}`);
  await new Promise((r) => setTimeout(r, 300));
}

// ---------- 2. Поиск рамки и подписи ----------
const hasCaption = (c) => c.suit === null || c.rank === 1 || c.rank >= 11;

function analyse(data, w, h) {
  const px = (x, y) => data[y * w + x];
  const rowDark = (y, x0, x1) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (px(x, y) < DARK) n++;
    return n / (x1 - x0);
  };
  const colDark = (x, y0, y1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (px(x, y) < DARK) n++;
    return n / (y1 - y0);
  };
  const maxLine = Math.round(w * 0.016);

  // Ищем линию рамки, двигаясь от края внутрь. Сканы бывают чуть наклонены, поэтому
  // берём первый заметный всплеск плотности, уточняем пик и возвращаем первую
  // координату ПОСЛЕ линии (с запасом: внутренний край наклонной линии «гуляет»).
  const findLine = (from, to, step, frac, threshold = 0.45) => {
    for (let i = from; step > 0 ? i < to : i > to; i += step) {
      if (frac(i) > threshold) {
        let peak = i, best = frac(i);
        for (let k = i; Math.abs(k - i) < maxLine; k += step) {
          const f = frac(k);
          if (f > best) { best = f; peak = k; }
        }
        let j = peak;
        while (Math.abs(j - i) < maxLine * 1.5 && frac(j) > 0.3) j += step;
        return { outer: i, inner: j + step * 2 };
      }
    }
    return null;
  };

  const y0 = Math.round(h * 0.2), y1 = Math.round(h * 0.8);
  const left = findLine(0, Math.round(w * 0.15), 1, (x) => colDark(x, y0, y1));
  const right = findLine(w - 1, Math.round(w * 0.85), -1, (x) => colDark(x, y0, y1));
  if (!left || !right) return { fail: `left=${!!left} right=${!!right}` };
  const x0 = left.inner + 4, x1 = right.inner - 4;
  const top = findLine(0, Math.round(h * 0.12), 1, (y) => rowDark(y, x0, x1));
  const bottom = findLine(h - 1, Math.round(h * 0.8), -1, (y) => rowDark(y, x0, x1));
  if (!top || !bottom) return { fail: `top=${!!top} bottom=${!!bottom}` };

  // Верхняя граница плашки с подписью — самая плотная строка в окне над нижней рамкой:
  // сплошная линия во всю ширину темнее любых строк с буквами.
  let caption = null;
  const innerH = bottom.inner - top.inner;
  let bestY = -1, best = 0;
  for (let y = bottom.inner - Math.round(innerH * 0.05); y > bottom.inner - Math.round(innerH * 0.13); y--) {
    const f = rowDark(y, x0, x1);
    if (f > best) { best = f; bestY = y; }
  }
  if (best > 0.7) {
    let j = bestY;
    while (bestY - j < maxLine * 1.5 && rowDark(j, x0, x1) > 0.3) j--;
    caption = { lineBottom: bestY, illustrationBottom: j - 2, density: +best.toFixed(2) };
  }
  return { left: left.inner, right: right.inner, top: top.inner, bottom: bottom.inner, caption };
}

const results = [];
for (const card of deck) {
  const file = path.join(srcDir, `${card.id}.jpg`);
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const a = analyse(data, info.width, info.height);
  if (a.fail) throw new Error(`Не нашлась рамка: ${card.name} (${a.fail})`);
  results.push({ card, a, w: info.width, h: info.height });
}

// доля высоты, которую занимает подпись (медиана по картам с подписью)
const median = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
const captionShare = median(
  results
    .filter((r) => hasCaption(r.card) && r.a.caption)
    .map((r) => (r.a.bottom - r.a.caption.illustrationBottom) / (r.a.bottom - r.a.top))
);

const crops = results.map(({ card, a, w, h }) => {
  const innerH = a.bottom - a.top;
  let bottom;
  const warn = [];
  if (hasCaption(card)) {
    const share = a.caption ? (a.bottom - a.caption.illustrationBottom) / innerH : null;
    if (!a.caption) warn.push("подпись не найдена — обрезаю по медиане");
    else if (Math.abs(share - captionShare) / captionShare > 0.2) {
      warn.push(`подозрительная высота подписи ${share.toFixed(3)} (медиана ${captionShare.toFixed(3)}) — обрезаю по медиане`);
      a.caption = null;
    }
    bottom = a.caption ? a.caption.illustrationBottom : Math.round(a.bottom - innerH * captionShare);
  } else {
    bottom = Math.round(a.bottom - innerH * captionShare);
  }
  return { card, w, h, left: a.left, top: a.top, width: a.right - a.left, height: bottom - a.top, warn };
});

const aspect = median(crops.map((c) => c.width / c.height));

// ---------- 3. Экспорт ----------
for (const c of crops) {
  for (const size of SIZES) {
    const target = path.join(outDir, String(size), `${c.card.slug}.webp`);
    await sharp(path.join(srcDir, `${c.card.id}.jpg`))
      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
      .resize(size, Math.round(size / aspect), { fit: "cover", position: "centre" })
      .webp({ quality: size > 400 ? 74 : 72, effort: 6, smartSubsample: true })
      .toFile(target);
  }
  if (c.warn.length) console.warn(`! ${c.card.name}: ${c.warn.join("; ")}`);
}

const sample = results[0];
console.log(
  JSON.stringify(
    {
      cards: crops.length,
      illustrationAspect: +aspect.toFixed(4),
      captionShareOfFrame: +captionShare.toFixed(4),
      // пропорции оригинальной карты — по ним CSS рисует рамку и плашку
      frameInsetsOfCard: {
        left: +(sample.a.left / sample.w).toFixed(4),
        right: +((sample.w - sample.a.right) / sample.w).toFixed(4),
        top: +(sample.a.top / sample.h).toFixed(4),
        bottom: +((sample.h - sample.a.bottom) / sample.h).toFixed(4),
      },
    },
    null,
    2
  )
);
