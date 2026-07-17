(() => {
  "use strict";

  const measurementId = String(window.DIS_ANALYTICS_CONFIG?.measurementId || "").trim();
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    document.documentElement.classList.add("analytics-disabled");
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-cookie-settings]")) return;
      document.querySelector("[data-consent-panel]")?.remove();
      const panel = document.createElement("section");
      panel.className = "consent-panel";
      panel.dataset.consentPanel = "";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-labelledby", "consent-title");
      panel.innerHTML = `
        <div class="consent-copy">
          <p class="consent-kicker"><span aria-hidden="true"></span> Поверителност и статистика</p>
          <h2 id="consent-title">Статистиката не е активна.</h2>
          <p>Тази версия на сайта не зарежда Google Analytics и не създава аналитични бисквитки. Техническият PWA кеш не служи за проследяване.</p>
          <a href="/cookies">Научи повече за бисквитките</a>
        </div>
        <div class="consent-actions">
          <button class="button secondary" type="button" data-consent-close>Затвори</button>
        </div>`;
      document.body.append(panel);
      const closeButton = panel.querySelector("[data-consent-close]");
      closeButton.addEventListener("click", () => panel.remove());
      closeButton.focus({ preventScroll: true });
    });
    return;
  }

  const consentCookie = "dis_cookie_consent";
  const acceptedValue = "analytics";
  const rejectedValue = "essential";
  let analyticsLoaded = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500
  });
  window.gtag("set", "ads_data_redaction", true);

  function readConsent() {
    const prefix = `${consentCookie}=`;
    const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  function saveConsent(value) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${consentCookie}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  function removeAnalyticsCookies() {
    document.cookie.split(";").forEach((part) => {
      const name = part.split("=")[0].trim();
      if (!name.startsWith("_ga")) return;
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    });
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.append(script);
  }

  function closePanel() {
    document.querySelector("[data-consent-panel]")?.remove();
  }

  function chooseEssential() {
    const shouldReload = analyticsLoaded;
    saveConsent(rejectedValue);
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    removeAnalyticsCookies();
    closePanel();
    if (shouldReload) window.location.reload();
  }

  function chooseAnalytics() {
    saveConsent(acceptedValue);
    loadAnalytics();
    closePanel();
  }

  function openPanel() {
    closePanel();
    const current = readConsent();
    const panel = document.createElement("section");
    panel.className = "consent-panel";
    panel.dataset.consentPanel = "";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "consent-title");
    panel.innerHTML = `
      <div class="consent-copy">
        <p class="consent-kicker"><span aria-hidden="true"></span> Поверителност и статистика</p>
        <h2 id="consent-title">Помогни ни да подобряваме сайта.</h2>
        <p>С твое съгласие използваме Google Analytics 4 само за обобщена статистика за посещенията. Рекламно проследяване и персонализация не се използват. Техническият PWA кеш е отделен от този избор и не служи за проследяване.</p>
        <a href="/cookies">Научи повече за бисквитките</a>
      </div>
      <div class="consent-actions">
        <button class="button secondary" type="button" data-consent-essential>Само необходими</button>
        <button class="button primary" type="button" data-consent-analytics>Приемам статистика</button>
      </div>`;
    document.body.append(panel);
    panel.querySelector("[data-consent-essential]").addEventListener("click", chooseEssential);
    panel.querySelector("[data-consent-analytics]").addEventListener("click", chooseAnalytics);
    const preferred = current === acceptedValue ? "[data-consent-analytics]" : "[data-consent-essential]";
    panel.querySelector(preferred)?.focus({ preventScroll: true });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-cookie-settings]")) openPanel();
  });

  const consent = readConsent();
  if (consent === acceptedValue) {
    loadAnalytics();
  } else if (consent !== rejectedValue) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", openPanel, { once: true });
    } else {
      openPanel();
    }
  }
})();
