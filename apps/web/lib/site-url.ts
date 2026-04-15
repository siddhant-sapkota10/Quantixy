const LOCAL_FALLBACK_URL = "http://localhost:3000/";

function normalizeBaseUrl(rawUrl: string) {
  let next = String(rawUrl || "").trim();

  if (!next) {
    next = LOCAL_FALLBACK_URL;
  }

  if (!/^https?:\/\//i.test(next)) {
    next = `https://${next}`;
  }

  if (!next.endsWith("/")) {
    next = `${next}/`;
  }

  return next;
}

export function getURL(path = "") {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    LOCAL_FALLBACK_URL;

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return new URL(normalizedPath, normalizedBaseUrl).toString();
}

