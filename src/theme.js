// --- Theme Switcher (Light / Dark Mode) ---
function getActiveTheme() {
  return document.documentElement.getAttribute("data-theme") || 
    (localStorage.getItem("gtm_theme") || "light");
}

function setTheme(themeName) {
  var theme = (themeName === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-astryx-theme", "neutral");
  localStorage.setItem("gtm_theme", theme);
  updateThemeUI(theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#09090b");
  document.dispatchEvent(new CustomEvent("gtm-theme-change", { detail: { theme } }));
}

function toggleTheme() {
  var currentTheme = getActiveTheme();
  var nextTheme = (currentTheme === "light") ? "dark" : "light";
  setTheme(nextTheme);
}

function updateThemeUI(theme) {
  var isLight = theme === "light";
  
  // Topnav B / W button matching Partner Portal
  var topnavBtn = document.getElementById("topnav-theme-btn");
  if (topnavBtn) {
    topnavBtn.title = isLight ? "Switch to Dark Mode (B / W)" : "Switch to Light Mode (B / W)";
    topnavBtn.textContent = "B / W";
  }

  var partnerToggle = document.getElementById("btn-theme-toggle");
  if (partnerToggle) {
    partnerToggle.title = isLight ? "Switch to Dark Mode (B / W)" : "Switch to Light Mode (B / W)";
    partnerToggle.textContent = "B / W";
  }
}

// Make functions globally available immediately
window.getActiveTheme = getActiveTheme;
window.setTheme = setTheme;
window.toggleTheme = toggleTheme;
window.updateThemeUI = updateThemeUI;

// Initialize theme UI once DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function() {
    setTheme(getActiveTheme());
  });
} else {
  setTheme(getActiveTheme());
}
