const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  downloadPressNewsThumbnail,
  pressNewsImageFilename,
  privateIpAddress,
  validatedRemoteImageUrl
} = require("../server/press-news-image");

test("press thumbnail filenames are deterministic and contain no source path", () => {
  const first = pressNewsImageFilename("https://images.example.com/photo.jpg?size=large");
  const second = pressNewsImageFilename("https://images.example.com/photo.jpg?size=large");

  assert.equal(first, second);
  assert.match(first, /^press-news-[a-f0-9]{32}\.webp$/);
  assert.doesNotMatch(first, /example|photo|large/);
});

test("press image validation rejects local and private network targets", async () => {
  assert.equal(privateIpAddress("127.0.0.1"), true);
  assert.equal(privateIpAddress("192.168.1.5"), true);
  assert.equal(privateIpAddress("93.184.216.34"), false);
  await assert.rejects(() => validatedRemoteImageUrl("http://localhost/image.jpg"), /Unsafe/);
  await assert.rejects(() => validatedRemoteImageUrl("https://images.example.com/image.jpg", async () => [{ address: "10.0.0.5", family: 4 }]), /not public/);
});

test("press images are converted to bounded WebP thumbnails", async () => {
  const source = await sharp({
    create: { width: 900, height: 900, channels: 3, background: { r: 20, g: 80, b: 160 } }
  }).png().toBuffer();
  const thumbnail = await downloadPressNewsThumbnail({
    sourceUrl: "https://images.example.com/photo.png",
    lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async () => new Response(source, {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(source.length) }
    })
  });
  const metadata = await sharp(thumbnail).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, THUMBNAIL_WIDTH);
  assert.equal(metadata.height, THUMBNAIL_HEIGHT);
});
