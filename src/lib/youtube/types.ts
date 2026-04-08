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
