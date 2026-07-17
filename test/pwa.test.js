const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  getSafariInstallPlatform,
  shouldEnablePullToRefresh,
  getPullHapticStep,
  getElasticPullDistance
} = require("../client/js/pwa");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("public and admin manifests have separate install identities", () => {
  const publicManifest = JSON.parse(read("manifest.webmanifest"));
  const adminManifest = JSON.parse(read("admin.webmanifest"));

  assert.equal(publicManifest.id, "/");
  assert.equal(publicManifest.start_url, "/");
  assert.equal(adminManifest.id, "/admin");
  assert.equal(adminManifest.start_url, "/admin");
  assert.equal(publicManifest.scope, "/");
  assert.equal(adminManifest.scope, "/admin");
  assert.equal(publicManifest.display, "standalone");
  assert.equal(adminManifest.display, "standalone");

  assert.ok(publicManifest.icons.every((icon) => !icon.src.includes("admin-")));
  assert.ok(adminManifest.icons.every((icon) => icon.src.includes("admin-")));

  for (const manifest of [publicManifest, adminManifest]) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
    assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  }
});

test("manual Safari installation is offered only on supported Apple targets", () => {
  const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
  const oldMacSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
  const macChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  assert.equal(getSafariInstallPlatform(macSafari, "MacIntel", 0), "mac");
  assert.equal(getSafariInstallPlatform(oldMacSafari, "MacIntel", 0), "");
  assert.equal(getSafariInstallPlatform(macChrome, "MacIntel", 0), "");
  assert.equal(getSafariInstallPlatform(iosSafari, "iPhone", 5), "ios");
});

test("every public page loads the public PWA metadata and installer", () => {
  const publicPages = [
    "index.html",
    "news.html",
    "fan-zone.html",
    "hosts.html",
    "partners.html",
    "contact.html",
    "privacy.html",
    "cookies.html"
  ];

  for (const page of publicPages) {
    const html = read(page);
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /pwa\.js\?v=/);
    assert.match(html, /apple-touch-icon/);
  }
});

test("admin page loads its own manifest and a capability-gated install button", () => {
  const html = read("admin.html");

  assert.match(html, /rel="manifest" href="\/admin\.webmanifest"/);
  assert.match(html, /href="\/admin\.webmanifest" crossorigin="use-credentials"/);
  assert.match(html, /apple-touch-icon[^>]+admin-apple-touch-icon\.png/);
  assert.match(html, /data-pwa-install-button[^>]*hidden/);
  assert.match(html, /admin-hero-topline/);
  assert.match(html, /class="pwa-install-button" data-pwa-install-button/);
  assert.match(html, /Добави админ приложение/);
  assert.match(html, /pwa\.js\?v=/);
});

test("server keeps the admin manifest private", () => {
  const server = read("server.js");

  assert.match(server, /url\.pathname === "\/admin\.webmanifest" && !isAuthenticated\(request\)/);
  assert.match(server, /return send\(response, 404, "Not found"/);
});

test("service worker bypasses private and dynamic routes", () => {
  const serviceWorker = read("sw.js");

  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/admin"\)/);
  assert.match(serviceWorker, /url\.pathname === "\/login"/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /caches\.match\(OFFLINE_URL\)/);
});

test("public policies disclose PWA storage and its exclusions", () => {
  const privacy = read("privacy.html");
  const cookies = read("cookies.html");

  for (const policy of [privacy, cookies]) {
    assert.match(policy, /Cache Storage/);
    assert.match(policy, /2026-07-17/);
    assert.match(policy, /админ/i);
    assert.match(policy, /Google Analytics/);
  }
});

test("cookie settings remain available when analytics is not configured", () => {
  const analytics = read("client/js/analytics.js");
  const styles = read("client/css/styles.css");

  assert.match(analytics, /Статистиката не е активна/);
  assert.match(analytics, /data-consent-close/);
  assert.doesNotMatch(styles, /analytics-disabled \[data-cookie-settings\]/);
});

test("public navigation and consent UI are compact on mobile", () => {
  const publicScript = read("client/js/script.js");
  const analytics = read("client/js/analytics.js");
  const styles = read("client/css/styles.css");

  assert.match(publicScript, /className = "nav-toggle"/);
  assert.match(publicScript, /aria-expanded/);
  assert.match(publicScript, /event\.key !== "Escape"/);
  assert.match(styles, /\.topbar\.is-nav-open \.nav/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /min-height: clamp\(510px, 70svh, 620px\)/);
  assert.doesNotMatch(styles, /\.subpage-hero \{ min-height: 100vh/);
  assert.match(analytics, /Помогни ни с анонимна статистика/);
  assert.match(styles, /width: min\(780px, calc\(100% - 32px\)\)/);
});

test("homepage promotes the prediction league only when visible matches exist", () => {
  const homepage = read("index.html");
  const publicScript = read("client/js/script.js");
  const styles = read("client/css/styles.css");

  assert.match(homepage, /data-home-league-promo[^>]*hidden/);
  assert.match(homepage, /href="\/fan-zone#prediction-league"/);
  assert.match(homepage, /Влез в играта/);
  assert.match(publicScript, /renderHomeLeaguePromo\(config\.predictionLeague\)/);
  assert.match(publicScript, /match\?\.enabled !== false/);
  assert.match(publicScript, /league\.enabled !== false && matches\.length > 0/);
  assert.match(styles, /\.home-league-promo-card/);
});

test("new prediction league recovery codes use a timed one-time modal", () => {
  const publicScript = read("client/js/script.js");
  const styles = read("client/css/styles.css");

  assert.match(publicScript, /const leagueRecoveryCloseDelay = 3/);
  assert.match(publicScript, /data-league-recovery-modal[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(publicScript, /след затваряне няма да можеш да видиш този код отново/);
  assert.match(publicScript, /data-close-recovery disabled/);
  assert.match(publicScript, /predictionLeagueRecoveryCode = ""/);
  assert.match(publicScript, /navigator\.clipboard\.writeText\(predictionLeagueRecoveryCode\)/);
  assert.match(publicScript, /data-close-recovery-backdrop/);
  assert.match(publicScript, /closeButtons\.forEach\(\(button\) => \{ button\.disabled = false; \}\)/);
  assert.doesNotMatch(styles, /body\.league-recovery-modal-open/);
  assert.match(styles, /\.league-recovery-close:disabled/);
  assert.match(styles, /\.league-recovery-dismiss/);
});

test("shared PWA script exposes an automatic offline status bar", () => {
  const pwa = read("client/js/pwa.js");
  const styles = read("client/css/styles.css");

  assert.match(pwa, /Офлайн режим — виждаш последно зареденото съдържание/);
  assert.match(pwa, /window\.addEventListener\("online"/);
  assert.match(pwa, /window\.addEventListener\("offline"/);
  assert.match(pwa, /!navigator\.onLine/);
  assert.match(styles, /\.pwa-offline-status/);
  assert.match(styles, /\.pwa-offline-status\[hidden\]/);
});

test("installed touch PWAs expose a guarded pull-to-refresh gesture", () => {
  const pwa = read("client/js/pwa.js");
  const styles = read("client/css/styles.css");
  const publicScript = read("client/js/script.js");
  const adminScript = read("client/js/admin.js");

  assert.equal(shouldEnablePullToRefresh(true, 5, false), true);
  assert.equal(shouldEnablePullToRefresh(true, 0, true), true);
  assert.equal(shouldEnablePullToRefresh(false, 5, true), false);
  assert.equal(shouldEnablePullToRefresh(true, 0, false), false);
  assert.equal(getPullHapticStep(0, 96), 0);
  assert.equal(getPullHapticStep(16, 96), 1);
  assert.equal(getPullHapticStep(48, 96), 3);
  assert.equal(getPullHapticStep(96, 96), 6);
  assert.ok(getElasticPullDistance(96) < 96);
  assert.ok(getElasticPullDistance(48) - getElasticPullDistance(0) > getElasticPullDistance(144) - getElasticPullDistance(96));

  assert.match(pwa, /display-mode: standalone/);
  assert.match(pwa, /navigator\.maxTouchPoints/);
  assert.match(pwa, /addEventListener\("touchstart"/);
  assert.match(pwa, /addEventListener\("touchmove"/);
  assert.match(pwa, /addEventListener\("touchend"/);
  assert.match(pwa, /navigator\.vibrate\(hapticStep === hapticSteps \? 18 : 6\)/);
  assert.match(pwa, /window\.DIS_PWA_REFRESH\(\)/);
  assert.doesNotMatch(pwa, /window\.location\.reload\(\)/);
  assert.match(pwa, /if \(refreshing\) \{\s*event\.preventDefault\(\)/);
  assert.match(pwa, /classList\.add\("pwa-refreshing"\)/);
  assert.match(pwa, /classList\.remove\("pwa-refreshing"\)/);
  assert.match(pwa, /if \(!navigator\.onLine\)/);
  assert.match(pwa, /Пусни за обновяване/);
  assert.match(styles, /\.pwa-pull-refresh/);
  assert.match(styles, /\.pwa-pull-refresh-content/);
  assert.match(pwa, /--pwa-content-pull-distance/);
  assert.match(styles, /\.pwa-pull-refresh\.is-refreshing/);
  assert.match(styles, /\.pwa-pull-refresh\.is-complete/);
  assert.match(styles, /html\.pwa-refreshing body/);
  assert.match(pwa, /const completeRefresh = \(\) =>/);
  assert.match(pwa, /window\.setTimeout\(\(\) => \{[\s\S]*setPullPosition\(0, true\)[\s\S]*\}, 180\)/);
  assert.match(styles, /clip-path: inset\(50%\)/);
  assert.match(styles, /overscroll-behavior-y: none/);
  assert.match(publicScript, /window\.DIS_PWA_REFRESH = \(\) => loadContent/);
  assert.match(adminScript, /window\.DIS_PWA_REFRESH = \(\) => loadAdminContent/);
  assert.match(publicScript, /cache: "no-store"/);
  assert.match(adminScript, /cache: "no-store"/);

  const indicatorStyles = styles.match(/\.pwa-pull-refresh \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(indicatorStyles, /right: 0/);
  assert.match(indicatorStyles, /left: 0/);
  assert.match(indicatorStyles, /margin-inline: auto/);
  assert.doesNotMatch(indicatorStyles, /translate3d\(-50%/);
});
