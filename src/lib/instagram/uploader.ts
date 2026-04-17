const IG_API_BASE = "https://graph.instagram.com/v22.0";
const CONTAINER_POLL_INTERVAL_MS = 5_000;
const CONTAINER_POLL_MAX_RETRIES = 24; // 2 minutes max

/**
 * Upload a video to Instagram as a Reels post using the Graph API.
 *
 * Steps:
 *  1. Create media container (POST /media with media_type REELS)
 *  2. Poll container status until FINISHED
 *  3. Publish the container (POST /media_publish)
 *
 * @param params.igUserId  - Instagram user ID (from account.accountId)
 * @param params.videoUrl  - Publicly accessible video URL (Supabase Storage public URL)
 * @param params.caption   - Post caption (title + description), truncated to 2200 chars
 * @returns Instagram media ID and public reel URL
 */
export async function uploadVideoToInstagram(params: {
  accessToken: string;
  igUserId: string;
  videoUrl: string;
  caption: string;
  onProgress?: (percent: number) => void;
}): Promise<{ reelsVideoId: string; videoUrl: string }> {
  const { accessToken, igUserId, videoUrl, caption, onProgress } = params;

  try {
    // ------------------------------------------------------------------
    // Step 1: Create media container
    // ------------------------------------------------------------------
    const createRes = await fetch(`${IG_API_BASE}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: caption.slice(0, 2200),
        access_token: accessToken,
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(
        `Instagram container create failed: HTTP ${createRes.status} — ${text.slice(0, 300)}`
      );
    }

    const createData = (await createRes.json()) as {
      id?: string;
      error?: { message?: string };
    };

    if (createData.error?.message) {
      throw new Error(`Instagram container error: ${createData.error.message}`);
    }

    const containerId = createData.id;
    if (!containerId) {
      throw new Error("Instagram API returned no container id");
    }

    onProgress?.(20);

    // ------------------------------------------------------------------
    // Step 2: Poll container status until FINISHED
    // ------------------------------------------------------------------
    let containerReady = false;
    for (let attempt = 0; attempt < CONTAINER_POLL_MAX_RETRIES; attempt++) {
      await sleep(CONTAINER_POLL_INTERVAL_MS);

      const statusRes = await fetch(
        `${IG_API_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
      );

      if (!statusRes.ok) {
        // Non-fatal: retry
        continue;
      }

      const statusData = (await statusRes.json()) as {
        id?: string;
        status_code?: string;
        status?: string;
        error?: { message?: string };
      };

      if (statusData.error?.message) {
        throw new Error(
          `Instagram container status error: ${statusData.error.message}`
        );
      }

      if (statusData.status_code === "FINISHED") {
        containerReady = true;
        break;
      }

      if (statusData.status_code === "ERROR") {
        throw new Error(
          `Instagram container processing failed: ${statusData.status ?? "unknown"}`
        );
      }

      // Status is IN_PROGRESS or similar — keep polling
    }

    if (!containerReady) {
      throw new Error(
        `Instagram container not ready after ${CONTAINER_POLL_MAX_RETRIES} attempts`
      );
    }

    onProgress?.(70);

    // ------------------------------------------------------------------
    // Step 3: Publish the container
    // ------------------------------------------------------------------
    const publishRes = await fetch(`${IG_API_BASE}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    if (!publishRes.ok) {
      const text = await publishRes.text();
      throw new Error(
        `Instagram publish failed: HTTP ${publishRes.status} — ${text.slice(0, 300)}`
      );
    }

    const publishData = (await publishRes.json()) as {
      id?: string;
      error?: { message?: string };
    };

    if (publishData.error?.message) {
      throw new Error(`Instagram publish error: ${publishData.error.message}`);
    }

    const reelsVideoId = publishData.id;
    if (!reelsVideoId) {
      throw new Error("Instagram API returned no media id after publish");
    }

    onProgress?.(100);

    return {
      reelsVideoId,
      videoUrl: `https://www.instagram.com/reels/${reelsVideoId}`,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Instagram upload failed: ${error.message}`);
    }
    throw new Error(`Instagram upload failed: ${String(error)}`);
  }
}

// --------------- helpers ---------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
