import { YOUTUBE_CHANNEL_ID } from "./config.js";

export async function fetchYoutubeLiveStatus(env) {
  const apiKey = env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({
      live: false,
      error: "Missing YOUTUBE_API_KEY secret"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
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
      return new Response(JSON.stringify({
        live: false,
        error: "YouTube API request failed",
        details: text
      }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await resp.json();
    const item = data?.items?.[0];
    const videoId = item?.id?.videoId ?? null;

    return new Response(JSON.stringify({
      live: Boolean(videoId),
      videoId,
      title: item?.snippet?.title ?? null,
      channelId: YOUTUBE_CHANNEL_ID,
      checkedAt: new Date().toISOString()
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      live: false,
      error: "youtube_live_status_failed",
      message: String(err)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
