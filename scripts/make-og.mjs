// Картинка-превью для соцсетей и мессенджеров: public/og.png (1200×630).
//   node scripts/make-og.mjs
// Название сайта на картинку намеренно не выводится — оно пока рабочее.

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200;
const H = 630;
const CARD_W = 200;

async function card(slug, name) {
  const pad = Math.round(CARD_W * 0.046);
  const line = 2;
  const innerW = CARD_W - pad * 2 - line * 2;
  const artH = Math.round((innerW * 1054) / 640);
  const capH = Math.round(CARD_W * 0.13);
  const cardH = pad * 2 + line * 3 + artH + capH;
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${cardH}">
    <rect width="${CARD_W}" height="${cardH}" rx="${CARD_W * 0.046}" fill="#efe6d2"/>
    <rect x="${pad}" y="${pad}" width="${CARD_W - pad * 2}" height="${cardH - pad * 2}" fill="#1b1712"/>
    <rect x="${pad + line}" y="${pad + line * 2 + artH}" width="${innerW}" height="${capH}" fill="#e3d9c5"/>
    <text x="${CARD_W / 2}" y="${pad + line * 2 + artH + capH * 0.66}" font-family="Georgia, 'Times New Roman', serif"
      font-size="${CARD_W * 0.056}" letter-spacing="1.4" fill="#1b1712" text-anchor="middle">${name.toUpperCase()}</text>
  </svg>`);
  const art = await sharp(path.join(root, "public/cards/640", `${slug}.webp`)).resize(innerW, artH).toBuffer();
  return sharp(frame)
    .composite([{ input: art, left: pad + line, top: pad + line }])
    .png()
    .toBuffer();
}

const tilt = async (buf, deg) =>
  sharp(buf).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

const shadow = async (buf) => {
  const meta = await sharp(buf).metadata();
  const pad = 30;
  const mask = await sharp(buf).extractChannel("alpha").toBuffer();
  const black = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: "#000" } })
    .joinChannel(mask)
    .png()
    .toBuffer();
  return sharp({ create: { width: meta.width + pad * 2, height: meta.height + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await sharp(black).ensureAlpha(0.55).png().toBuffer(), left: pad, top: pad + 14 },
    ])
    .blur(14)
    .composite([{ input: buf, left: pad, top: pad }])
    .png()
    .toBuffer();
};

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="18%" r="85%">
      <stop offset="0" stop-color="#262b5c"/>
      <stop offset=".55" stop-color="#14182f"/>
      <stop offset="1" stop-color="#0e1124"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="${W / 2}" y="574" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#ede6d6"
    text-anchor="middle">Расклады Таро для размышлений</text>
  <rect x="${W / 2 - 28}" y="596" width="56" height="2" fill="#e7b649"/>
</svg>`);

const [moon, star, sun] = await Promise.all([card("luna", "Луна"), card("zvezda", "Звезда"), card("solntse", "Солнце")]);
const left = await shadow(await tilt(moon, -10));
const right = await shadow(await tilt(sun, 10));
const center = await shadow(star);
const lm = await sharp(left).metadata();
const cm = await sharp(center).metadata();

await sharp(background)
  .composite([
    { input: left, left: Math.round(W / 2 - cm.width / 2 - lm.width * 0.62), top: 70 },
    { input: right, left: Math.round(W / 2 + cm.width / 2 - lm.width * 0.38), top: 70 },
    { input: center, left: Math.round(W / 2 - cm.width / 2), top: 36 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "public/og.png"));

console.log("public/og.png готов");
