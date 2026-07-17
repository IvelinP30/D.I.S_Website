function getSafariInstallPlatform(userAgent, platform, maxTouchPoints) {
  const isIos = /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Chrome|Chromium/i.test(userAgent);
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

function setupPullToRefresh() {
  if (!shouldEnablePullToRefresh(isStandalonePwa(), navigator.maxTouchPoints, "ontouchstart" in window)) return;

  document.documentElement.classList.add("pwa-standalone", "pwa-pull-refresh-enabled");

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
  const maxPullDistance = 118;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let readyToRefresh = false;
  let refreshing = false;
  let resetTimer = 0;

  const setPullPosition = (rawDistance) => {
    const progress = Math.min(1, rawDistance / refreshThreshold);
    const visualDistance = Math.min(88, rawDistance * 0.8);
    indicator.style.setProperty("--pull-distance", `${visualDistance}px`);
    indicator.style.setProperty("--pull-opacity", String(Math.min(1, progress * 1.5)));
    indicator.style.setProperty("--pull-rotation", `${Math.round(progress * 280)}deg`);
  };

  const hideIndicator = () => {
    indicator.classList.remove("is-visible", "is-pulling", "is-ready", "is-refreshing", "is-error");
    indicator.setAttribute("aria-hidden", "true");
    indicator.style.setProperty("--pull-distance", "0px");
    indicator.style.setProperty("--pull-opacity", "0");
    indicator.style.setProperty("--pull-rotation", "0deg");
    label.textContent = "Издърпай за обновяване";
    readyToRefresh = false;
    tracking = false;
  };

  const scheduleHide = (delay = 220) => {
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(hideIndicator, delay);
  };

  window.addEventListener("touchstart", (event) => {
    if (refreshing || event.touches.length !== 1 || window.scrollY > 0) return;

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    readyToRefresh = false;
    window.clearTimeout(resetTimer);
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (!tracking || refreshing || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = touch.clientY - startY;

    if (window.scrollY > 0 || deltaY <= 0 || deltaX > deltaY) {
      tracking = false;
      scheduleHide();
      return;
    }

    event.preventDefault();
    const pullDistance = Math.min(maxPullDistance, deltaY);
    const reachedThreshold = pullDistance >= refreshThreshold;

    indicator.classList.add("is-visible", "is-pulling");
    indicator.classList.toggle("is-ready", reachedThreshold);
    indicator.setAttribute("aria-hidden", "false");
    label.textContent = reachedThreshold ? "Пусни за обновяване" : "Издърпай за обновяване";
    setPullPosition(pullDistance);

    if (reachedThreshold && !readyToRefresh && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
    readyToRefresh = reachedThreshold;
  }, { passive: false });

  const finishPull = () => {
    if (!tracking || refreshing) return;

    tracking = false;
    indicator.classList.remove("is-pulling", "is-ready");

    if (!readyToRefresh) {
      scheduleHide();
      return;
    }

    if (!navigator.onLine) {
      indicator.classList.add("is-visible", "is-error");
      label.textContent = "Няма интернет";
      setPullPosition(refreshThreshold);
      scheduleHide(900);
      return;
    }

    refreshing = true;
    indicator.classList.add("is-visible", "is-refreshing");
    label.textContent = "Обновяване…";
    setPullPosition(refreshThreshold);
    window.setTimeout(() => window.location.reload(), 260);
  };

  window.addEventListener("touchend", finishPull, { passive: true });
  window.addEventListener("touchcancel", () => {
    if (!refreshing) scheduleHide();
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
  setupNetworkStatus();
  setupPullToRefresh();
  setupPwa();
}
if (typeof module !== "undefined") module.exports = { getSafariInstallPlatform, shouldEnablePullToRefresh };
