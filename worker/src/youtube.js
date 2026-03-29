import { YOUTUBE_CHANNEL_ID } from "./config.js";

const YOUTUBE_LIVE_STATUS_CACHE_KEY = "youtube_live_status";
const LIVE_CACHE_SECONDS = 60;
const OFFLINE_CACHE_SECONDS = 180;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

export async function fetchYoutubeLiveStatus(env, forceRefresh = false) {
  const apiKey = env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return jsonResponse({
      live: false,
      error: "Missing YOUTUBE_API_KEY secret"
    }, 500);
  }

  if (!env.YOUTUBE_CACHE) {
    return jsonResponse({
      live: false,
      error: "Missing YOUTUBE_CACHE KV binding"
    }, 500);
  }

  const cache = env.YOUTUBE_CACHE;

  if (!forceRefresh) {
    const cached = await cache.get(YOUTUBE_LIVE_STATUS_CACHE_KEY, "text");
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      });
    }
  }

  const ytUrl =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet` +
    `&channelId=${encodeURIComponent(YOUTUBE_CHANNEL_ID)}` +
    `&eventType=live` +
    `&type=video` +
    `&maxResults=1` +
    `&key=${encodeURIComponent(apiKey)}`;

  try {
    const resp = await fetch(ytUrl, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return jsonResponse({
        live: false,
        error: "YouTube API request failed",
        details: text
      }, 502);
    }

    const data = await resp.json();
    const item = data?.items?.[0];
    const videoId = item?.id?.videoId ?? null;

    const payload = {
      live: Boolean(videoId),
      videoId,
      title: item?.snippet?.title ?? null,
      channelId: YOUTUBE_CHANNEL_ID,
      checkedAt: new Date().toISOString()
    };

    await cache.put(
      YOUTUBE_LIVE_STATUS_CACHE_KEY,
      JSON.stringify(payload),
      {
        expirationTtl: payload.live ? LIVE_CACHE_SECONDS : OFFLINE_CACHE_SECONDS
      }
    );

    return jsonResponse(payload);
  } catch (err) {
    return jsonResponse({
      live: false,
      error: "youtube_live_status_failed",
      message: String(err)
    }, 500);
  }
}
