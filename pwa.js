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

function setupPwa() {
  if ("serviceWorker" in navigator) {
    const registerServiceWorker = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
  }

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
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
  setupPwa();
}
if (typeof module !== "undefined") module.exports = { getSafariInstallPlatform };
