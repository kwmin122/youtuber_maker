const TIKTOK_INIT_URL =
  "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIKTOK_STATUS_URL =
  "https://open.tiktokapis.com/v2/post/publish/status/fetch/";
const STATUS_POLL_INTERVAL_MS = 5_000;
const STATUS_POLL_MAX_RETRIES = 12;

/**
 * Upload a video to TikTok using the Content Posting API v2 (direct post flow).
 *
 * Steps:
 *  1. Initialize upload — receive publish_id and upload_url
 *  2. PUT raw video bytes to upload_url
 *  3. Poll publish status until PUBLISH_COMPLETE or FAILED
 *
 * @returns TikTok video ID and public video URL
 */
export async function uploadVideoToTikTok(params: {
  accessToken: string;
  videoBuffer: Buffer;
  title: string;
  description: string;
  privacyLevel:
    | "PUBLIC_TO_EVERYONE"
    | "MUTUAL_FOLLOW_FRIENDS"
    | "SELF_ONLY";
  onProgress?: (percent: number) => void;
}): Promise<{ tiktokVideoId: string; videoUrl: string }> {
  const {
    accessToken,
    videoBuffer,
    title,
    description,
    privacyLevel,
    onProgress,
  } = params;

  try {
    // ------------------------------------------------------------------
    // Step 1: Initialize upload
    // ------------------------------------------------------------------
    const initBody = {
      post_info: {
        title: title.slice(0, 150),
        description: description.slice(0, 2200),
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoBuffer.length,
        chunk_size: videoBuffer.length,
        total_chunk_count: 1,
      },
    };

    const initRes = await fetch(TIKTOK_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(initBody),
    });

    if (!initRes.ok) {
      const text = await initRes.text();
      throw new Error(
        `TikTok init upload failed: HTTP ${initRes.status} — ${text.slice(0, 300)}`
      );
    }

    const initData = (await initRes.json()) as {
      data?: { publish_id?: string; upload_url?: string };
      error?: { message?: string };
    };

    if (initData.error?.message) {
      throw new Error(`TikTok init error: ${initData.error.message}`);
    }

    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error("TikTok API returned no publish_id or upload_url");
    }

    // ------------------------------------------------------------------
    // Step 2: Upload video bytes
    // ------------------------------------------------------------------
    const end = videoBuffer.length - 1;
    const total = videoBuffer.length;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(total),
        "Content-Range": `bytes 0-${end}/${total}`,
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(
        `TikTok video upload failed: HTTP ${uploadRes.status} — ${text.slice(0, 300)}`
      );
    }

    onProgress?.(50);

    // ------------------------------------------------------------------
    // Step 3: Poll publish status
    // ------------------------------------------------------------------
    for (let attempt = 0; attempt < STATUS_POLL_MAX_RETRIES; attempt++) {
      await sleep(STATUS_POLL_INTERVAL_MS);

      // TikTok status fetch uses POST with JSON body
      const statusRes = await fetch(
        TIKTOK_STATUS_URL + "?fields=status,fail_reason",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        }
      );

      if (!statusRes.ok) {
        // Non-fatal: retry
        continue;
      }

      const statusData = (await statusRes.json()) as {
        data?: {
          status?: string;
          fail_reason?: string;
          publicaly_available_post_id?: string[];
        };
        error?: { message?: string };
      };

      const status = statusData.data?.status;

      if (status === "PUBLISH_COMPLETE") {
        const tiktokVideoId =
          statusData.data?.publicaly_available_post_id?.[0] ?? publishId;
        onProgress?.(100);
        return {
          tiktokVideoId,
          videoUrl: `https://www.tiktok.com/@me/video/${tiktokVideoId}`,
        };
      }

      if (status === "FAILED") {
        throw new Error(
          `TikTok publish failed: ${statusData.data?.fail_reason ?? "unknown reason"}`
        );
      }

      // Status is still processing (PROCESSING_UPLOAD, etc.) — keep polling
    }

    throw new Error(
      `TikTok publish timed out after ${STATUS_POLL_MAX_RETRIES} attempts`
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`TikTok upload failed: ${error.message}`);
    }
    throw new Error(`TikTok upload failed: ${String(error)}`);
  }
}

// --------------- helpers ---------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
