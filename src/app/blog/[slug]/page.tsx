import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getAllPosts, getPost } from "@/lib/blog";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/config/site";
import styles from "../blog.module.css";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
    },
  };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const others = getAllPosts()
    .filter((p) => p.slug !== slug)
    .slice(0, 3);
  const url = `${SITE.url}/blog/${slug}`;

  return (
    <article className={`page ${styles.wrap}`}>
      <nav className={styles.crumbs} aria-label="Навигационная цепочка">
        <Link href="/blog">Блог</Link>
      </nav>

      <header className={styles.postHead}>
        <h1>{post.title}</h1>
        <p className={styles.meta}>
          <time dateTime={post.date}>{formatDate(post.date)}</time>, {post.readingMinutes} мин чтения
        </p>
      </header>

      <div className={`prose ${styles.body}`} dangerouslySetInnerHTML={{ __html: post.html }} />

      <aside className={styles.cta}>
        <p>Попробуйте сами: задайте открытый вопрос и посмотрите, что подскажут карты.</p>
        <Link href="/" className="btn btn-primary">
          Сделать расклад
        </Link>
      </aside>

      {others.length > 0 && (
        <nav className={styles.more} aria-labelledby="more-title">
          <h2 id="more-title">Читать дальше</h2>
          <ul>
            {others.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BlogPosting",
              headline: post.title,
              description: post.description,
              datePublished: post.date,
              dateModified: post.updated ?? post.date,
              inLanguage: "ru",
              keywords: post.keywords.join(", "),
              mainEntityOfPage: url,
              author: { "@type": "Organization", name: SITE.name },
              publisher: { "@type": "Organization", name: SITE.name },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Блог", item: `${SITE.url}/blog` },
                { "@type": "ListItem", position: 2, name: post.title, item: url },
              ],
            },
          ],
        }}
      />
    </article>
  );
}
