import type { Metadata } from "next";
import Link from "next/link";
import { CARDS, type TarotCard } from "@/data/cards";
import { SUITS, type Suit } from "@/data/types";
import { StaticCard } from "@/components/TarotCard";
import styles from "./karty.module.css";

export const metadata: Metadata = {
  title: "Значения карт Таро: все 78 арканов колоды Райдера–Уэйта",
  description:
    "Значения всех 78 карт Таро Райдера–Уэйта: Старшие и Младшие арканы в прямом и перевёрнутом положении, в любви, работе и как совет.",
  alternates: { canonical: "/karty" },
};

interface Group {
  id: string;
  title: string;
  intro: string;
  cards: TarotCard[];
}

const SUIT_INTRO: Record<Suit, string> = {
  wands: "Стихия Огня: энергия, страсть, действие и творчество.",
  cups: "Стихия Воды: чувства, отношения и интуиция.",
  swords: "Стихия Воздуха: мысли, решения, правда и конфликты.",
  pentacles: "Стихия Земли: деньги, работа, тело и повседневные дела.",
};

export default function CardsIndexPage() {
  const groups: Group[] = [
    {
      id: "starshie-arkany",
      title: "Старшие арканы",
      intro: "Двадцать две карты о больших жизненных темах, поворотах и уроках — путь от Шута до Мира.",
      cards: CARDS.filter((c) => c.arcana === "major"),
    },
    ...(Object.keys(SUITS) as Suit[]).map((suit) => ({
      id: suit,
      title: SUITS[suit].name,
      intro: SUIT_INTRO[suit],
      cards: CARDS.filter((c) => c.suit === suit),
    })),
  ];

  return (
    <div className={`page ${styles.wrap}`}>
      <header className={styles.head}>
        <h1>Значения карт Таро</h1>
        <p>
          Все 78 карт колоды Райдера–Уэйта: что изображено на карте, что она значит в прямом и перевёрнутом положении,
          в любви и в работе, какой совет даёт и над каким вопросом предлагает подумать.
        </p>
        <nav className={styles.jump} aria-label="Разделы колоды">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`}>
              {g.title}
            </a>
          ))}
        </nav>
      </header>

      {groups.map((g) => (
        <section key={g.id} id={g.id} className={styles.group} aria-labelledby={`${g.id}-title`}>
          <div className={styles.groupHead}>
            <h2 id={`${g.id}-title`}>{g.title}</h2>
            <p>{g.intro}</p>
          </div>
          <ul className={styles.grid}>
            {g.cards.map((c) => (
              <li key={c.slug}>
                <Link href={`/karty/${c.slug}`} className={styles.item}>
                  <StaticCard
                    slug={c.slug}
                    name={c.name}
                    width="100%"
                    sizes="(max-width: 520px) 30vw, (max-width: 900px) 18vw, 140px"
                    alt=""
                  />
                  <span className={styles.itemName}>{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
