export type YouTubeChannelData = {
  id: string;
  title: string;
  handle?: string;
  customUrl?: string;
  description?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  country?: string;
  publishedAt?: string;
};

export type YouTubeVideoData = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  duration?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags?: string[];
};

export type ChannelSearchResult = {
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
};

/** YouTube upload snippet metadata */
export type YouTubeUploadSnippet = {
  title: string;
  description: string;
  tags: string[];
  categoryId: string; // "22" = People & Blogs
};

/** YouTube upload status after completion */
export type YouTubeUploadStatus = {
  uploadStatus: string; // 'uploaded' | 'processed' | 'failed'
  privacyStatus: string;
  publishAt?: string;
};
