import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { CARDS } from "@/data/cards";
import { getAllPosts } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  const posts = getAllPosts();
  const latestPost = posts[0] ? new Date(posts[0].updated ?? posts[0].date) : new Date();

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/karty`, changeFrequency: "monthly", priority: 0.8 },
    ...CARDS.map((c) => ({
      url: `${base}/karty/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/blog`, lastModified: latestPost, changeFrequency: "weekly", priority: 0.7 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.updated ?? p.date),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
