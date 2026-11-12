import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CARDS, cardBySlug } from "@/data/cards";
import { SUITS, cardImage } from "@/data/types";
import { StaticCard } from "@/components/TarotCard";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/config/site";
import styles from "./card.module.css";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return CARDS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const card = cardBySlug(slug);
  if (!card) return {};
  const title = `${card.name} — значение карты Таро в прямом и перевёрнутом положении`;
  const description = `${card.name}: ${card.keywords.join(", ")}. Значение в прямом и перевёрнутом положении, в любви, в работе и совет карты.`;
  return {
    title,
    description,
    alternates: { canonical: `/karty/${slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      images: [{ url: cardImage(slug, 640), width: 640, height: 1054, alt: `Карта Таро «${card.name}»` }],
    },
  };
}

export default async function CardPage({ params }: Params) {
  const { slug } = await params;
  const card = cardBySlug(slug);
  if (!card) notFound();

  const prev = CARDS[(card.id + CARDS.length - 1) % CARDS.length];
  const next = CARDS[(card.id + 1) % CARDS.length];
  const group = card.suit
    ? `Младший аркан, масть ${SUITS[card.suit].name}, стихия ${SUITS[card.suit].element}`
    : `Старший аркан ${card.numeral}`;
  const url = `${SITE.url}/karty/${card.slug}`;

  return (
    <article className={`page ${styles.wrap}`}>
      <nav className={styles.crumbs} aria-label="Навигационная цепочка">
        <Link href="/karty">Значения карт</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{card.name}</span>
      </nav>

      <div className={styles.layout}>
        <div className={styles.visual}>
          <StaticCard slug={card.slug} name={card.name} width="100%" eager sizes="(max-width: 760px) 64vw, 340px" />
        </div>

        <div className={styles.text}>
          <p className={styles.group}>{group}</p>
          <h1>{card.name}</h1>
          <p className={styles.scene}>{card.scene}</p>

          <dl className={styles.keywords}>
            <div>
              <dt>В прямом положении</dt>
              <dd>{card.keywords.join(", ")}</dd>
            </div>
            <div>
              <dt>В перевёрнутом</dt>
              <dd>{card.keywordsReversed.join(", ")}</dd>
            </div>
          </dl>

          <div className={`prose ${styles.prose}`}>
            <h2>Значение в прямом положении</h2>
            <p>{card.upright}</p>
            <h2>Значение в перевёрнутом положении</h2>
            <p>{card.reversed}</p>
            <h2>В любви и отношениях</h2>
            <p>{card.love}</p>
            <h2>В работе и финансах</h2>
            <p>{card.work}</p>
            <h2>Совет карты</h2>
            <blockquote>{card.advice}</blockquote>
            <h2>Вопрос для размышления</h2>
            <p>{card.question}</p>
          </div>

          <div className={styles.cta}>
            <p>Как эта карта говорит о вашей ситуации? Задайте вопрос и вытяните свои карты.</p>
            <Link href="/" className="btn btn-primary">
              Сделать расклад
            </Link>
          </div>
        </div>
      </div>

      <nav className={styles.pager} aria-label="Соседние карты">
        <Link href={`/karty/${prev.slug}`} rel="prev">
          <span className={styles.pagerLabel}>Предыдущая карта</span>
          <span className={styles.pagerName}>{prev.name}</span>
        </Link>
        <Link href={`/karty/${next.slug}`} rel="next" className={styles.pagerNext}>
          <span className={styles.pagerLabel}>Следующая карта</span>
          <span className={styles.pagerName}>{next.name}</span>
        </Link>
      </nav>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: `${card.name} — значение карты Таро`,
              description: card.upright,
              image: `${SITE.url}${cardImage(card.slug, 640)}`,
              inLanguage: "ru",
              mainEntityOfPage: url,
              author: { "@type": "Organization", name: SITE.name },
              publisher: { "@type": "Organization", name: SITE.name },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Значения карт", item: `${SITE.url}/karty` },
                { "@type": "ListItem", position: 2, name: card.name, item: url },
              ],
            },
          ],
        }}
      />
    </article>
  );
}
