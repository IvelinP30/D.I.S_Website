function isSafariBrowser(userAgent = "") {
  return /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Chrome|Chromium|Android/i.test(userAgent);
}

function getSafariInstallPlatform(userAgent, platform, maxTouchPoints) {
  const isIos = /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isSafari = isSafariBrowser(userAgent);
  if (isIos && isSafari) return "ios";

  const safariVersion = Number(userAgent.match(/Version\/(\d+(?:\.\d+)?)/)?.[1] || 0);
  const isMac = !isIos && /Macintosh|Mac OS X/i.test(userAgent);
  return isMac && isSafari && safariVersion >= 17 ? "mac" : "";
}

function setupNetworkStatus() {
  const banner = document.createElement("aside");
  banner.className = "pwa-offline-status";
  banner.hidden = true;
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.textContent = "Офлайн режим — виждаш последно зареденото съдържание. Интерактивните функции временно не работят.";
  document.body.append(banner);

  const updateNetworkStatus = () => {
    const isOffline = !navigator.onLine;
    banner.hidden = !isOffline;
    document.documentElement.classList.toggle("is-offline", isOffline);
  };

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();
}

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function shouldEnablePullToRefresh(standalone, maxTouchPoints, hasTouchStart) {
  return standalone && (maxTouchPoints > 0 || hasTouchStart);
}

function getPullHapticStep(distance, threshold, steps = 6) {
  if (distance <= 0 || threshold <= 0 || steps <= 0) return 0;
  return Math.min(steps, Math.floor((distance / threshold) * steps));
}

function getElasticPullDistance(distance, limit = 92, resistance = 68) {
  if (distance <= 0 || limit <= 0 || resistance <= 0) return 0;
  return limit * (1 - Math.exp(-distance / resistance));
}

function setupPullToRefresh() {
  if (!shouldEnablePullToRefresh(isStandalonePwa(), navigator.maxTouchPoints, "ontouchstart" in window)) return;

  document.documentElement.classList.add("pwa-standalone", "pwa-pull-refresh-enabled");
  const content = document.querySelector(".site-shell, .admin-shell") || document.body;
  content.classList.add("pwa-pull-refresh-content");

  const indicator = document.createElement("aside");
  indicator.className = "pwa-pull-refresh";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.setAttribute("aria-hidden", "true");
  indicator.innerHTML = `
    <span class="pwa-pull-refresh-icon" aria-hidden="true"></span>
    <span class="pwa-pull-refresh-label">Издърпай за обновяване</span>
  `;
  document.body.append(indicator);

  const label = indicator.querySelector(".pwa-pull-refresh-label");
  const refreshThreshold = 96;
  const maxPullDistance = 180;
  const hapticSteps = 6;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let readyToRefresh = false;
  let refreshing = false;
  let resetTimer = 0;
  let lastHapticStep = 0;
  let pullFrame = 0;
  let pendingPullDistance = 0;

  const renderPullPosition = (rawDistance) => {
    const progress = Math.min(1, rawDistance / refreshThreshold);
    const visualDistance = getElasticPullDistance(rawDistance);
    indicator.style.setProperty("--pull-distance", `${visualDistance}px`);
    indicator.style.setProperty("--pull-opacity", String(Math.min(1, progress * 1.5)));
    indicator.style.setProperty("--pull-rotation", `${Math.round(progress * 320)}deg`);
    indicator.style.setProperty("--pull-scale", String(0.82 + progress * 0.18));
    content.style.setProperty("--pwa-content-pull-distance", `${visualDistance}px`);
  };

  const setPullPosition = (rawDistance, immediate = false) => {
    pendingPullDistance = Math.max(0, rawDistance);
    if (pullFrame) window.cancelAnimationFrame(pullFrame);
    if (immediate) {
      renderPullPosition(pendingPullDistance);
      pullFrame = 0;
      return;
    }
    pullFrame = window.requestAnimationFrame(() => {
      renderPullPosition(pendingPullDistance);
      pullFrame = 0;
    });
  };

  const hideIndicator = () => {
    indicator.classList.remove("is-visible", "is-pulling", "is-ready", "is-refreshing", "is-complete", "is-error");
    content.classList.remove("is-pulling", "is-refreshing");
    document.documentElement.classList.remove("pwa-refreshing");
    indicator.setAttribute("aria-hidden", "true");
    label.textContent = "Издърпай за обновяване";
    readyToRefresh = false;
    tracking = false;
    refreshing = false;
    lastHapticStep = 0;
  };

  const scheduleHide = (delay = 220) => {
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(hideIndicator, delay);
  };

  const returnToRest = (delay = 280) => {
    indicator.classList.remove("is-pulling", "is-ready", "is-refreshing", "is-complete", "is-error");
    content.classList.remove("is-pulling", "is-refreshing");
    setPullPosition(0, true);
    scheduleHide(delay);
  };

  const completeRefresh = () => {
    indicator.classList.add("is-complete");
    window.setTimeout(() => {
      indicator.classList.remove("is-refreshing");
      content.classList.remove("is-refreshing");
      setPullPosition(0, true);
      scheduleHide(360);
    }, 180);
  };

  window.addEventListener("touchstart", (event) => {
    if (refreshing || event.touches.length !== 1 || window.scrollY > 0) return;

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    readyToRefresh = false;
    lastHapticStep = 0;
    indicator.classList.remove("is-complete", "is-error", "is-refreshing");
    content.classList.remove("is-refreshing");
    window.clearTimeout(resetTimer);
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (refreshing) {
      event.preventDefault();
      return;
    }
    if (!tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = touch.clientY - startY;

    if (window.scrollY > 0 || deltaY <= 0 || deltaX > deltaY) {
      tracking = false;
      returnToRest();
      return;
    }

    event.preventDefault();
    const pullDistance = Math.min(maxPullDistance, deltaY);
    const reachedThreshold = pullDistance >= refreshThreshold;

    indicator.classList.add("is-visible", "is-pulling");
    indicator.classList.toggle("is-ready", reachedThreshold);
    content.classList.add("is-pulling");
    indicator.setAttribute("aria-hidden", "false");
    label.textContent = reachedThreshold ? "Пусни за обновяване" : "Издърпай за обновяване";
    setPullPosition(pullDistance);

    const hapticStep = getPullHapticStep(pullDistance, refreshThreshold, hapticSteps);
    if (hapticStep > lastHapticStep) {
      if (typeof navigator.vibrate === "function") navigator.vibrate(hapticStep === hapticSteps ? 18 : 6);
      lastHapticStep = hapticStep;
    }
    readyToRefresh = reachedThreshold;
  }, { passive: false });

  const finishPull = async () => {
    if (!tracking || refreshing) return;

    tracking = false;
    indicator.classList.remove("is-pulling", "is-ready");
    content.classList.remove("is-pulling");

    if (!readyToRefresh) {
      returnToRest();
      return;
    }

    if (!navigator.onLine) {
      indicator.classList.add("is-visible", "is-error");
      label.textContent = "Няма интернет";
      setPullPosition(refreshThreshold, true);
      window.setTimeout(() => returnToRest(), 700);
      return;
    }

    refreshing = true;
    document.documentElement.classList.add("pwa-refreshing");
    indicator.classList.add("is-visible", "is-refreshing");
    content.classList.add("is-refreshing");
    label.textContent = "Обновяване…";
    setPullPosition(refreshThreshold, true);

    try {
      if (typeof window.DIS_PWA_REFRESH !== "function") throw new Error("Content refresh is unavailable");
      await Promise.all([
        window.DIS_PWA_REFRESH(),
        new Promise((resolve) => window.setTimeout(resolve, 520))
      ]);
      label.textContent = "Обновено";
      completeRefresh();
    } catch {
      indicator.classList.remove("is-refreshing");
      indicator.classList.add("is-error");
      content.classList.remove("is-refreshing");
      label.textContent = "Обновяването не успя";
      window.setTimeout(() => returnToRest(), 800);
    }
  };

  window.addEventListener("touchend", finishPull, { passive: true });
  window.addEventListener("touchcancel", () => {
    if (!refreshing) returnToRest();
  }, { passive: true });
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    const registerServiceWorker = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
  }

  const isStandalone = isStandalonePwa();
  const userAgent = navigator.userAgent;
  const safariInstallPlatform = getSafariInstallPlatform(userAgent, navigator.platform, navigator.maxTouchPoints);
  const isAdmin = document.body.classList.contains("admin-body");
  const safariInstructions = safariInstallPlatform === "mac"
    ? "В Safari натисни бутона <strong>Споделяне</strong> и избери <strong>Добавяне към Dock</strong>. Функцията изисква macOS Sonoma 14 или по-нова версия."
    : "В Safari натисни бутона <strong>Споделяне</strong>, след което избери <strong>Добавяне към Начален екран</strong>.";

  let installButton = document.querySelector("[data-pwa-install-button]");
  if (!installButton && !isAdmin) {
    const footerActions = document.querySelector(".footer-actions");
    if (footerActions) {
      installButton = document.createElement("button");
      installButton.type = "button";
      installButton.className = "pwa-install-button";
      installButton.textContent = "Добави като приложение";
      footerActions.prepend(installButton);
    }
  }

  if (!installButton) return;
  installButton.hidden = true;
  if (isStandalone) return;
  installButton.setAttribute("aria-haspopup", "dialog");

  const instructions = document.createElement("div");
  instructions.className = "pwa-install-modal";
  instructions.hidden = true;
  instructions.innerHTML = `
    <button class="pwa-install-backdrop" type="button" aria-label="Затвори"></button>
    <section class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <p class="section-kicker">${isAdmin ? "Добави D.I.S Админ" : "Добави D.I.S"}</p>
      <h2 id="pwa-install-title">Като приложение на началния екран</h2>
      <p>${safariInstructions}</p>
      <button class="button primary pwa-install-close" type="button">Разбрах</button>
    </section>
  `;
  document.body.append(instructions);

  const closeButton = instructions.querySelector(".pwa-install-close");
  const closeInstructions = () => {
    instructions.hidden = true;
    document.body.classList.remove("pwa-install-modal-open");
    installButton.focus();
  };
  const openInstructions = () => {
    instructions.hidden = false;
    document.body.classList.add("pwa-install-modal-open");
    closeButton.focus();
  };

  instructions.querySelector(".pwa-install-backdrop").addEventListener("click", closeInstructions);
  closeButton.addEventListener("click", closeInstructions);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !instructions.hidden) closeInstructions();
  });

  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
    installButton.removeAttribute("aria-haspopup");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });

  if (safariInstallPlatform) installButton.hidden = false;

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      if (safariInstallPlatform) openInstructions();
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}

if (typeof window !== "undefined") {
  if (isSafariBrowser(window.navigator.userAgent)) {
    document.documentElement.classList.add("safari-memory-optimized");
  }
  setupNetworkStatus();
  setupPullToRefresh();
  setupPwa();
}
if (typeof module !== "undefined") {
  module.exports = { isSafariBrowser, getSafariInstallPlatform, shouldEnablePullToRefresh, getPullHapticStep, getElasticPullDistance };
}
