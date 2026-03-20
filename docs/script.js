document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname.split("/").pop() || "index.html";

  const navClass = (file) => (path === file ? "active" : "");

  const header = `
    <div class="topbar">
      <div class="container topbar-inner">
        <div class="brand"><a href="index.html">EmberSensor</a></div>
        <nav class="nav">
          <a class="${navClass("index.html")}" href="index.html">Home</a>
          <a class="${navClass("how-it-works.html")}" href="how-it-works.html">How It Works</a>
          <a class="${navClass("progress.html")}" href="progress.html">Progress</a>
          <a class="${navClass("live-monitoring.html")}" href="live-monitoring.html">Live Monitoring</a>
          <a class="${navClass("screenshots.html")}" href="screenshots.html">Screenshots</a>
        </nav>
      </div>
    </div>
  `;

  const footer = `
    <footer>
      EmberSensor • Connected wildfire monitoring and response system
    </footer>
  `;

  const headerTarget = document.getElementById("site-header");
  const footerTarget = document.getElementById("site-footer");

  if (headerTarget) headerTarget.innerHTML = header;
  if (footerTarget) footerTarget.innerHTML = footer;
});

function injectHome(home) {
  if (!home) return;

  setText("home-eyebrow", home.eyebrow);
  setText("home-title", home.title);
  setText("home-lead", home.lead);
  setText("home-why-title", home.whyTitle);
  setText("home-why-text", home.whyText);
  setText("home-features-title", home.featuresTitle);
  setText("home-features-text", home.featuresText);

  const statsTarget = document.getElementById("home-stats");
  if (statsTarget && Array.isArray(home.stats)) {
    statsTarget.innerHTML = home.stats.map(stat => `
      <div class="stat">
        <div class="num">${stat.num}</div>
        <div class="label">${stat.label}</div>
      </div>
    `).join("");
  }

  const featuresTarget = document.getElementById("home-features");
  if (featuresTarget && Array.isArray(home.features)) {
    featuresTarget.innerHTML = home.features.map(feature => `
      <div class="card">
        <h3>${feature.title}</h3>
        <p>${feature.text}</p>
      </div>
    `).join("");
  }
}

function injectHowItWorks(data) {
  if (!data) return;

  setText("how-title", data.title);
  setText("how-lead", data.lead);
  setText("how-intro-title", data.introTitle);
  setText("how-intro-1", data.intro1);
  setText("how-intro-2", data.intro2);

  const stepsTarget = document.getElementById("how-steps");
  if (stepsTarget && Array.isArray(data.steps)) {
    stepsTarget.innerHTML = data.steps.map((step, index) => `
      <div class="step">
        <div class="step-num">${index + 1}</div>
        <div>
          <h3>${step.title}</h3>
          <p>${step.text}</p>
        </div>
      </div>
    `).join("");
  }
}

function injectProgress(data) {
  if (!data) return;

  setText("progress-title", data.title);
  setText("progress-lead", data.lead);
  setText("progress-cta-title", data.ctaTitle);
  setText("progress-cta-text", data.ctaText);

  const target = document.getElementById("progress-milestones");
  if (target && Array.isArray(data.milestones)) {
    target.innerHTML = data.milestones.map(item => {
      const parts = item.split(": ");
      const label = parts[0] || "";
      const rest = parts.slice(1).join(": ");
      return `<div class="milestone"><strong>${label}:</strong> ${rest}</div>`;
    }).join("");
  }
}

function injectLiveMonitoring(data) {
  if (!data) return;

  setText("live-title", data.title);
  setText("live-lead", data.lead);

  const target = document.getElementById("live-cards");
  if (target && Array.isArray(data.cards)) {
    target.innerHTML = data.cards.map(card => `
      <div class="card">
        <h3>${card.title}</h3>
        <p>${card.text}</p>
      </div>
    `).join("");
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && typeof value === "string") {
    el.textContent = value;
  }
}
