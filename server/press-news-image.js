const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const sharp = require("sharp");

const MAX_SOURCE_IMAGE_BYTES = 5_000_000;
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 270;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function pressNewsImageFilename(sourceUrl = "") {
  const digest = crypto.createHash("sha256").update(String(sourceUrl)).digest("hex").slice(0, 32);
  return `press-news-${digest}.webp`;
}

function privateIpv4(address = "") {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

function privateIpAddress(address = "") {
  const normalized = String(address).toLowerCase().split("%")[0];
  const family = net.isIP(normalized);
  if (family === 4) return privateIpv4(normalized);
  if (family !== 6) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? privateIpv4(mappedIpv4) : false;
}

async function validatedRemoteImageUrl(value, lookupImpl = dns.lookup) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Invalid press image URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) throw new Error("Unsafe press image URL");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Unsafe press image host");
  const directFamily = net.isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) => privateIpAddress(entry.address))) {
    throw new Error("Press image host is not public");
  }
  return url;
}

async function limitedResponseBuffer(response, limit = MAX_SOURCE_IMAGE_BYTES) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > limit) throw new Error("Press image is too large");
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limit) throw new Error("Press image is too large");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Press image is too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

async function downloadPressNewsThumbnail({ sourceUrl, fetchImpl = fetch, lookupImpl = dns.lookup } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  timeout.unref?.();
  try {
    let currentUrl = await validatedRemoteImageUrl(sourceUrl, lookupImpl);
    let response;
    for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
      response = await fetchImpl(currentUrl, {
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
        redirect: "manual",
        signal: controller.signal
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === 2) throw new Error("Too many press image redirects");
      currentUrl = await validatedRemoteImageUrl(new URL(location, currentUrl).href, lookupImpl);
    }
    if (!response?.ok) throw new Error(`Press image request failed (${response?.status || 0})`);
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error("Unsupported press image type");
    const sourceBuffer = await limitedResponseBuffer(response);
    return sharp(sourceBuffer, { animated: false, limitInputPixels: 40_000_000 })
      .rotate()
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover", position: "attention" })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  MAX_SOURCE_IMAGE_BYTES,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  downloadPressNewsThumbnail,
  pressNewsImageFilename,
  privateIpAddress,
  validatedRemoteImageUrl
};
