import Link from "next/link";
import { SITE } from "@/config/site";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`page ${styles.inner}`}>
        <div className={styles.about}>
          <p className={styles.brand}>{SITE.name}</p>
          <p className={styles.motto}>
            Таро здесь — зеркало для размышлений, а не предсказание судьбы. Карты помогают увидеть ситуацию яснее, а
            решения остаются за вами.
          </p>
        </div>
        <nav className={styles.nav} aria-label="Разделы сайта">
          <Link href="/">Сделать расклад</Link>
          <Link href="/karty">Значения карт</Link>
          <Link href="/blog">Блог</Link>
          <Link href="/dnevnik">Дневник раскладов</Link>
          <Link href="/oferta">Публичная оферта</Link>
          <Link href="/privacy">Политика конфиденциальности</Link>
        </nav>
      </div>
      <div className={`page ${styles.fine}`}>
        <p>
          Трактовки носят развлекательный и рефлексивный характер и не заменяют консультацию врача, юриста или финансового
          специалиста.
        </p>
        <p>
          Иллюстрации — колода Райдера–Уэйта (художница Памела Колман Смит, 1909), общественное достояние; сканы из{" "}
          <a href="https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck" rel="noopener" target="_blank">
            Wikimedia Commons
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
