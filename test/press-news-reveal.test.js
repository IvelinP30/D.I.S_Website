const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the newspaper starts revealing before its heading reaches the viewport", () => {
  const script = read("client/js/script.js");
  const styles = read("client/css/styles.css");
  const news = read("news.html");

  assert.match(script, /renderPage\(\);\s+bindPressNewsReveal\(\);/);
  assert.match(script, /rootMargin: "0px 0px 180px 0px"/);
  assert.match(script, /target\.classList\.add\("reveal", "reveal-fast"\)/);
  assert.match(styles, /\.reveal\.reveal-fast[\s\S]*opacity 260ms ease/);
  assert.match(news, /script\.js\?v=20260722-4/);
});
