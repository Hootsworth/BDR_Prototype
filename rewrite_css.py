import re

file_path = "/Users/adityadixit/My stuff/power-cli/LangChain/style.css"

with open(file_path, "r") as f:
    css = f.read()

# 1. Replace :root tokens
root_tokens = """:root {
  /* Core palette */
  --primary: #1c1c1e;
  --primary-active: #2c2c34;
  --primary-disabled: #e0e2e8;

  /* Text hierarchy */
  --ink: #1c1c1e;
  --body: #555a6a;
  --body-strong: #2c2c34;
  --muted: #a5a8b5;
  --muted-soft: #c7cad5;

  /* Surfaces */
  --canvas: #ffffff;
  --surface-soft: #f7f8fa;
  --surface-card: #ffffff;
  --surface-strong: #eef0f3;
  --surface-cream-strong: #eef0f3;
  --surface-dark: #1c1c1e;
  --surface-dark-elevated: #2c2c34;
  --surface-dark-soft: #1c1c1e;

  /* Borders */
  --hairline: #e0e2e8;
  --hairline-soft: #eef0f3;

  /* On-surface text */
  --on-primary: #ffffff;
  --on-dark: #ffffff;
  --on-dark-soft: #a5a8b5;

  /* Semantic */
  --success: #00b473;
  --warning: #ffd02f;
  --error: #ff9999;
  --info: #4262ff;

  /* Brand accent spectrum */
  --brand-pink: #ffd8f4;
  --brand-teal: #0fbcb0;
  --brand-lavender: #4262ff;
  --brand-peach: #ffe6cd;
  --brand-ochre: #ffd02f;
  --brand-mint: #c3faf5;
  --brand-coral: #ff9999;

  /* Typography stacks */
  --font-display: 'Noto Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-code: 'JetBrains Mono', 'Menlo', monospace;

  /* Border radius scale */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 9999px;

  /* Sidebar dimensions */
  --nav-width: 64px;
  --nav-width-open: 240px;

  /* Motion */
  --transition: 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

  /* Legacy */
  --bg-surface: var(--surface-card);
  --bg-surface-active: var(--surface-strong);
  --bg-canvas: var(--canvas);
}"""
css = re.sub(r':root\s*\{[^}]+\}', root_tokens, css, flags=re.MULTILINE)

# 2. Fix fonts in Google font import
css = re.sub(r'@import url\([^\)]+\);', "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans:wght@500&display=swap');", css)

# 3. Typography changes for headings
css = re.sub(r'h1, h2, h3, h4, h5 \{[^}]+\}', r'h1, h2, h3, h4, h5 {\n  font-family: var(--font-display);\n  font-weight: 500;\n  color: var(--ink);\n  letter-spacing: -1.0px;\n  line-height: 1.2;\n}', css)
css = re.sub(r'h1 \{.*\}', r'h1 { font-size: 32px; letter-spacing: -1.5px; }', css)
css = re.sub(r'h2 \{.*\}', r'h2 { font-size: 24px; letter-spacing: -1.0px; }', css)
css = re.sub(r'h3 \{.*\}', r'h3 { font-size: 20px; letter-spacing: -0.5px; }', css)

# 4. Remove glassmorphism (backdrop-filter)
css = re.sub(r'backdrop-filter:[^;]+;', '', css)
css = re.sub(r'-webkit-backdrop-filter:[^;]+;', '', css)

# 5. Buttons and badges -> pills
css = re.sub(r'(\.btn[^\{]*\{[^}]*)border-radius:\s*var\(--radius-[^\)]+\);', r'\1border-radius: var(--radius-pill);', css)
css = re.sub(r'(\.status-badge[^\{]*\{[^}]*)border-radius:\s*var\(--radius-[^\)]+\);', r'\1border-radius: var(--radius-pill);', css)

# 6. Flat elevation - remove brutalist box-shadows everywhere, add hover box shadows for interactive cards
css = re.sub(r'box-shadow:\s*[0-9]+px\s+[0-9]+px\s+0\s+var\(--hairline\);', 'box-shadow: none;', css)
css = re.sub(r'box-shadow:\s*[0-9]+px\s+[0-9]+px\s+0\s+rgba[^;]+;', 'box-shadow: none;', css)
css = re.sub(r'box-shadow:\s*inset[^;]+;', 'box-shadow: none;', css)

hover_shadow = 'box-shadow: rgba(5,0,56,0.06) 0px 4px 12px;'
# Replace kpi-card hover
css = re.sub(r'(\.dashboard-kpi-card:hover\s*\{[^}]*)box-shadow:[^;]+;', r'\1' + hover_shadow, css)
# Replace glass panel hover
css = re.sub(r'(\.glass-panel:hover\s*\{[^}]*)box-shadow:[^;]+;', r'\1' + hover_shadow, css)
# Meeting card hover
css = re.sub(r'(\.meeting-card:hover\s*\{[^}]*)transform: translateY\([^)]+\);', r'\1transform: translateY(-2px);\n  ' + hover_shadow, css)

# 7. Card borders to hairline-soft, Table borders to hairline
css = re.sub(r'(\.glass-panel[^\{]*\{[^}]*)border:\s*1px\s+solid\s+var\(--hairline\)', r'\1border: 1px solid var(--hairline-soft)', css)
css = re.sub(r'(\.metric-card[^\{]*\{[^}]*)border:\s*1px\s+solid\s+var\(--hairline\)', r'\1border: 1px solid var(--hairline-soft)', css)
css = re.sub(r'(\.dashboard-kpi-card[^\{]*\{[^}]*)border:\s*1\.5px\s+solid\s+var\(--hairline\)', r'\1border: 1px solid var(--hairline-soft)', css)
# Make KPI cards have pastel top borders cyclically using CSS nth-child if possible, or just standard for now
css = re.sub(r'(\.dashboard-kpi-card\s*\{)', r'\1\n  border-top: 3px solid var(--brand-pink);', css)

# 8. Remove grain overlay
css = re.sub(r'body::after\s*\{[^}]+\}', 'body::after {\n  content: none;\n  display: none;\n}', css)

# 9. App loading screen accent
css = re.sub(r'(\.loading-spinner-fill\s*\{[^}]*background:\s*)var\(--brand-pink\)', r'\1var(--brand-ochre)', css)
css = re.sub(r'(\.loading-logo\s*\{[^}]*background:\s*)var\(--surface-card\)', r'\1var(--brand-ochre)', css)

# 10. Dashboard specific fixes for brutalist shadow removal
css = re.sub(r'box-shadow:\s*2px\s+2px\s+0\s+var\(--hairline\);', 'box-shadow: none;', css)
css = re.sub(r'box-shadow:\s*3px\s+3px\s+0\s+var\(--hairline\);', 'box-shadow: none;', css)

with open(file_path, "w") as f:
    f.write(css)

print("Rewrote style.css with Miro styling.")
