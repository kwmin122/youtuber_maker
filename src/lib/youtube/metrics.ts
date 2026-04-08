/**
 * Performance Score = viewCount / subscriberCount (D-04)
 * A score > 1.0 means the video outperformed the channel average.
 * Returns 0 if subscriberCount is 0 (division by zero guard).
 */
export function calcPerformanceScore(
  viewCount: number,
  subscriberCount: number
): number {
  if (subscriberCount <= 0) return 0;
  return Math.round((viewCount / subscriberCount) * 1000) / 1000;
}

/**
 * Engagement Rate = (likeCount + commentCount) / viewCount * 100 (D-06)
 * Returns 0 if viewCount is 0.
 */
export function calcEngagementRate(
  likeCount: number,
  commentCount: number,
  viewCount: number
): number {
  if (viewCount <= 0) return 0;
  return (
    Math.round(((likeCount + commentCount) / viewCount) * 100 * 1000) /
    1000
  );
}

/**
 * CII (Channel Influence Index) = (avgViews * avgEngagementRate) / subscriberCount (D-05)
 * Weighted toward recent videos (last 30 days).
 * Returns 0 if subscriberCount is 0.
 */
export function calcCII(
  avgViews: number,
  avgEngagementRate: number,
  subscriberCount: number
): number {
  if (subscriberCount <= 0) return 0;
  return (
    Math.round(
      ((avgViews * avgEngagementRate) / subscriberCount) * 1000
    ) / 1000
  );
}
