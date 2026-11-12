import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, getAllPosts } from "@/lib/blog";
import styles from "./blog.module.css";

export const metadata: Metadata = {
  title: "Блог о Таро и самопознании",
  description:
    "Статьи о том, как работать с картами Таро для саморефлексии: как задавать вопросы, читать расклады и вести дневник.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  return (
    <div className={`page ${styles.wrap}`}>
      <header className={styles.head}>
        <h1>Блог</h1>
        <p>О Таро как инструменте самопознания: как задавать вопросы картам, читать расклады и слышать себя.</p>
      </header>

      {posts.length === 0 ? (
        <p className={styles.empty}>Статей пока нет — первая появится совсем скоро.</p>
      ) : (
        <ul className={styles.list}>
          {posts.map((p) => (
            <li key={p.slug} className={styles.item}>
              <p className={styles.meta}>
                <time dateTime={p.date}>{formatDate(p.date)}</time>, {p.readingMinutes} мин чтения
              </p>
              <h2>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </h2>
              <p className={styles.desc}>{p.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
