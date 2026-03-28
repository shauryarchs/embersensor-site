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
