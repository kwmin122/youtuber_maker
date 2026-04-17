/**
 * Phase 9 default category list for KR trending ingestion.
 *
 * Source: https://developers.google.com/youtube/v3/docs/videoCategories/list
 * Selected for: (a) availability in regionCode=KR, (b) relevance to
 * Korean shorts niches (뷰티/게임/요리/엔터/교육/브이로그 등), (c) avoiding
 * categories that YouTube flags as unavailable outside of certain regions
 * (e.g. 19 Travel & Events is sparse in KR).
 */
export interface TrendCategory {
  id: number;
  label: string; // Korean display label for /trends dashboard
  slug: string;  // URL-safe ascii for future routing
}

export const DEFAULT_KR_CATEGORIES: readonly TrendCategory[] = [
  { id: 10, label: "음악", slug: "music" },
  { id: 17, label: "스포츠", slug: "sports" },
  { id: 20, label: "게임", slug: "games" },
  { id: 22, label: "브이로그/일상", slug: "people-blogs" },
  { id: 23, label: "코미디", slug: "comedy" },
  { id: 24, label: "엔터테인먼트", slug: "entertainment" },
  { id: 25, label: "뉴스/정치", slug: "news" },
  { id: 26, label: "Howto/스타일", slug: "howto-style" },
  { id: 27, label: "교육", slug: "education" },
  { id: 1,  label: "영화/애니", slug: "film-animation" },
] as const;
