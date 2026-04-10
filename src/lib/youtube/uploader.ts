import { google, Auth } from "googleapis";
import { Readable } from "stream";

/**
 * Upload a video to YouTube using resumable upload via googleapis.
 *
 * Requires: youtube.upload OAuth scope on the user's Google account.
 *
 * @param params - Upload parameters including access token, video buffer, and metadata.
 * @returns The YouTube video ID and URL.
 */
export async function uploadVideoToYouTube(params: {
  accessToken: string;
  videoBuffer: Buffer;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus: "private" | "unlisted" | "public";
  publishAt?: string;
  thumbnailBuffer?: Buffer;
  onProgress?: (percent: number) => void;
}): Promise<{ youtubeVideoId: string; videoUrl: string }> {
  // Validate: if publishAt is set, privacyStatus must be "private"
  if (params.publishAt && params.privacyStatus !== "private") {
    throw new Error(
      "Scheduled uploads (publishAt) require privacyStatus to be 'private'. " +
        "YouTube uses private + publishAt for scheduled publishing."
    );
  }

  // Create OAuth2 client with user's access token
  const oauth2Client = new Auth.OAuth2Client();
  oauth2Client.setCredentials({ access_token: params.accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // Build request body
  const requestBody = {
    snippet: {
      title: params.title,
      description: params.description,
      tags: params.tags,
      categoryId: params.categoryId || "22",
    },
    status: {
      privacyStatus: params.privacyStatus,
      selfDeclaredMadeForKids: false,
      ...(params.publishAt && { publishAt: params.publishAt }),
    },
  };

  try {
    // Resumable upload with progress tracking via onUploadProgress
    const res = await youtube.videos.insert(
      {
        part: ["snippet", "status"],
        requestBody,
        media: {
          mimeType: "video/mp4",
          body: Readable.from(params.videoBuffer),
        },
      },
      {
        onUploadProgress: (evt: { bytesRead?: number }) => {
          if (params.onProgress && evt.bytesRead) {
            const percent = Math.round(
              (evt.bytesRead / params.videoBuffer.length) * 100
            );
            params.onProgress(percent);
          }
        },
      }
    );

    const videoId = res.data.id;
    if (!videoId) {
      throw new Error("YouTube API returned no video ID after upload");
    }

    // Upload custom thumbnail if provided
    if (params.thumbnailBuffer) {
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: "image/png",
          body: Readable.from(params.thumbnailBuffer),
        },
      });
    }

    return {
      youtubeVideoId: videoId,
      videoUrl: `https://youtube.com/shorts/${videoId}`,
    };
  } catch (error: unknown) {
    // Extract YouTube API error message
    if (
      error &&
      typeof error === "object" &&
      "errors" in error &&
      Array.isArray((error as Record<string, unknown>).errors)
    ) {
      const apiErrors = (error as Record<string, unknown[]>).errors;
      const messages = apiErrors
        .map((e: unknown) =>
          typeof e === "object" && e && "message" in e
            ? (e as { message: string }).message
            : String(e)
        )
        .join("; ");
      throw new Error(`YouTube upload failed: ${messages}`);
    }
    if (error instanceof Error) {
      throw new Error(`YouTube upload failed: ${error.message}`);
    }
    throw new Error(`YouTube upload failed: ${String(error)}`);
  }
}
