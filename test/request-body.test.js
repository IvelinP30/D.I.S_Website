const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");
const { readUtf8Body } = require("../server/request-body");

test("decodes Cyrillic correctly when a character is split between request chunks", async () => {
  const payload = JSON.stringify({ text: "Текст с буквата в и още кирилица." });
  const bytes = Buffer.from(payload, "utf8");
  const letter = Buffer.from("в", "utf8");
  const letterStart = bytes.indexOf(letter);
  const request = Readable.from([
    bytes.subarray(0, letterStart + 1),
    bytes.subarray(letterStart + 1)
  ]);

  assert.equal(await readUtf8Body(request), payload);
  assert.equal(JSON.parse(payload).text.includes("в"), true);
});

test("decodes a UTF-8 request only after all byte chunks are collected", async () => {
  const payload = JSON.stringify({ text: "Български текст без повредени символи." });
  const request = Readable.from([...Buffer.from(payload, "utf8")].map((byte) => Buffer.from([byte])));

  const decoded = await readUtf8Body(request);
  assert.equal(decoded, payload);
  assert.doesNotMatch(decoded, /�/);
});

test("rejects request bodies above the byte limit", async () => {
  const request = Readable.from([Buffer.from("12345")]);
  await assert.rejects(readUtf8Body(request, 4), /Request body too large/);
});
