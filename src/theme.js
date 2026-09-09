// --- Theme Switcher (Light / Dark Mode) ---
function getActiveTheme() {
  return document.documentElement.getAttribute("data-theme") || 
    (localStorage.getItem("gtm_theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
}

function setTheme(themeName) {
  var theme = (themeName === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-astryx-theme", "neutral");
  localStorage.setItem("gtm_theme", theme);
  updateThemeUI(theme);
}

function toggleTheme() {
  var currentTheme = getActiveTheme();
  var nextTheme = (currentTheme === "light") ? "dark" : "light";
  setTheme(nextTheme);
}

function updateThemeUI(theme) {
  var isLight = theme === "light";
  
  // Icon SVGs
  var sunSvg = '<svg class="theme-icon-svg" id="topnav-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  
  var moonSvg = '<svg class="theme-icon-svg" id="topnav-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

  // Topnav
  var topnavBtn = document.getElementById("topnav-theme-btn");
  var topnavLabel = document.getElementById("topnav-theme-label");
  var topnavIcon = document.getElementById("topnav-theme-icon");
  if (topnavBtn) {
    topnavBtn.title = isLight ? "Switch to Dark Mode" : "Switch to Light Mode";
    if (topnavLabel) topnavLabel.textContent = isLight ? "Dark Mode" : "Light Mode";
    if (topnavIcon) topnavIcon.outerHTML = isLight ? moonSvg : sunSvg;
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
