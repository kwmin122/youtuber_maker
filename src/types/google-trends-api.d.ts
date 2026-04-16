declare module "google-trends-api" {
  export function dailyTrends(opts: {
    trendDate?: Date;
    geo?: string;
    hl?: string;
  }): Promise<string>;
  export function realTimeTrends(opts: {
    geo: string;
    category?: string;
  }): Promise<string>;
}
