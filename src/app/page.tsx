import Link from "next/link";
import { ReadingTable } from "@/components/reading/ReadingTable";
import { JsonLd } from "@/components/JsonLd";
import { CARDS, LITE_DECK } from "@/data/cards";
import { getAllPosts, formatDate } from "@/lib/blog";
import { paymentsInfo } from "@/lib/payments/server";
import { SITE } from "@/config/site";
import { FREE_PER_DAY, FREE_SPREAD, PRICES, formatRub } from "@/config/pricing";
import { SPREADS, SPREAD_LIST } from "@/data/spreads";
import styles from "./home.module.css";

/** «Сколько стоит?» — собирается из цен в src/config/pricing.ts. */
function priceAnswer(): string {
  const paid = SPREAD_LIST.filter((s) => s.id !== FREE_SPREAD || FREE_PER_DAY === 0)
    .map((s) => `${s.title.toLowerCase()} (${s.cardsLabel}) — ${formatRub(PRICES[s.id])}`)
    .join(", ");
  const freeSpread = SPREADS[FREE_SPREAD];
  const times = FREE_PER_DAY === 1 ? "раз в день" : `${FREE_PER_DAY} раза в день`;
  const free =
    FREE_PER_DAY > 0
      ? `${freeSpread.title} (${freeSpread.cardsLabel}) — бесплатно, ${times}; сверх этого — ${formatRub(PRICES[FREE_SPREAD])}. `
      : "";
  return (
    `${free}${paid.charAt(0).toUpperCase()}${paid.slice(1)}. ` +
    "Перемешать колоду, вытянуть карты и прочитать их значения можно бесплатно: платите только за персональную трактовку и только после того, как карты лягут. " +
    "Оплата — через СБП или банковской картой на странице платёжного сервиса, данные карты сайт не видит. " +
    "Не пришла трактовка — деньги вернутся: её можно бесплатно повторить или отказаться от неё. При оплате картой сумма списывается сразу после успешной оплаты."
  );
}

const FAQ = [
  {
    q: "Это гадание?",
    a: "Нет. Здесь Таро — инструмент саморефлексии: образы карт помогают взглянуть на ситуацию с новой стороны и заметить чувства и варианты, которые вы упускали. Будущее не предопределено, решения остаются за вами.",
  },
  {
    q: "Как сформулировать вопрос?",
    a: "Лучше всего работают открытые вопросы о вас и ваших действиях: «Что мне важно понять о…», «Как мне…», «Что поможет…». Вопросы «да или нет» и попытки узнать мысли другого человека дают меньше пользы.",
  },
  {
    q: "Перевёрнутая карта — это плохо?",
    a: "Нет. Перевёрнутая карта показывает, что её энергия ослаблена, заблокирована или обращена внутрь. Это подсказка, куда посмотреть внимательнее, а не дурной знак.",
  },
  {
    q: "Кто составляет трактовку?",
    a: "Трактовку пишет искусственный интеллект, опираясь на классические значения колоды Райдера–Уэйта, позиции расклада и ваш вопрос. Если ИИ недоступен, вы увидите базовую трактовку по значениям карт.",
  },
  {
    q: "Где хранятся мои расклады?",
    a: "Дневник раскладов хранится только в вашем браузере, на этом устройстве. Чтобы составить трактовку, вопрос и карты отправляются на сервер сайта и сервису ИИ; они нигде не публикуются.",
  },
];

export default function HomePage() {
  const majors = CARDS.filter((c) => c.arcana === "major");
  const posts = getAllPosts().slice(0, 3);
  const payments = paymentsInfo();
  const faq = payments.enabled ? [...FAQ.slice(0, 1), { q: "Сколько это стоит?", a: priceAnswer() }, ...FAQ.slice(1)] : FAQ;

  return (
    <>
      <ReadingTable deck={LITE_DECK} payments={payments} />

      <div className={`page ${styles.below}`}>
        <section className={styles.mirror} aria-labelledby="mirror-title">
          <h2 id="mirror-title">Таро как зеркало, а не приговор</h2>
          <p>
            Карты не знают вашего будущего — и не должны. Их сила в образах: Отшельник с фонарём, Звезда над водой,
            Башня, в которую бьёт молния. Положенные рядом с вашим вопросом, они помогают увидеть ситуацию под новым
            углом, назвать то, что вы чувствуете, и выбрать следующий шаг.
          </p>
          <p>
            Поэтому каждая трактовка заканчивается вопросом для размышления. Запишите ответ в дневник — через неделю
            будет интересно перечитать. <Link href="/blog/taro-kak-instrument-samopoznaniya">Подробнее о подходе</Link>
          </p>
        </section>

        <section className={styles.index} aria-labelledby="index-title">
          <h2 id="index-title">Старшие арканы</h2>
          <p className={styles.indexList}>
            {majors.map((c, i) => (
              <span key={c.slug}>
                <Link href={`/karty/${c.slug}`}>{c.name}</Link>
                {i < majors.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
          <p className={styles.indexMore}>
            <Link href="/karty">Все 78 карт и их значения</Link>
          </p>
        </section>

        {posts.length > 0 && (
          <section className={styles.posts} aria-labelledby="posts-title">
            <h2 id="posts-title">Из блога</h2>
            <ul>
              {posts.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className={styles.postTitle}>
                    {p.title}
                  </Link>
                  <p>{p.description}</p>
                  <p className={styles.postMeta}>
                    <time dateTime={p.date}>{formatDate(p.date)}</time>, {p.readingMinutes} мин чтения
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.faq} aria-labelledby="faq-title">
          <h2 id="faq-title">Частые вопросы</h2>
          {faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: SITE.name,
              url: SITE.url,
              inLanguage: "ru",
              description: SITE.description,
            },
            {
              "@type": "FAQPage",
              mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ],
        }}
      />
    </>
  );
}
