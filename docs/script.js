// Page contract — every HTML page in docs/ must include:
//
// In <head>:
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//   <link rel="icon" href="favicon.ico" type="image/x-icon" />
//   <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png" />
//   <link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png" />
//   <link rel="stylesheet" href="style.css" />
//
// In <body>:
//   <div id="site-header"></div>   ← nav is injected here
//   ...page content...
//   <div id="site-footer"></div>   ← footer is injected here
//   <script src="script.js"></script>
//
// To add a new page: copy the nav entry below and update the href and label.

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
          <a class="${navClass("status.html")}" href="status.html">Live Fire Risk</a>
          <a class="${navClass("live.html")}" href="live.html">Live Camera</a>
          <a class="${navClass("screenshots.html")}" href="screenshots.html">Gallery</a>
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
