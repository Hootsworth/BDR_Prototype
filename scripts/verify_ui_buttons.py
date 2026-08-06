import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_FILES = []

for root, dirs, files in os.walk(ROOT):
    if "node_modules" in root or ".git" in root or ".venv" in root:
        continue
    for f in files:
        if f.endswith(".html"):
            HTML_FILES.append(os.path.join(root, f))

JS_FILES = []
for root, dirs, files in os.walk(os.path.join(ROOT, "src")):
    for f in files:
        if f.endswith(".js"):
            JS_FILES.append(os.path.join(root, f))

JS_FILES.append(os.path.join(ROOT, "app.js"))
JS_FILES.append(os.path.join(ROOT, "config.js"))

js_content = ""
for path in JS_FILES:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            js_content += f.read() + "\n"

onclick_pattern = re.compile(r'onclick=["\']([^"\']+)["\']')
fn_call_pattern = re.compile(r'([a-zA-Z0-9_$]+)\s*\(')

all_onclick_funcs = set()
for html_path in HTML_FILES:
    with open(html_path, encoding="utf-8") as f:
        content = f.read()
        matches = onclick_pattern.findall(content)
        for m in matches:
            fn_matches = fn_call_pattern.findall(m)
            for fn in fn_matches:
                if fn not in ("return", "if", "for", "while", "switch", "console"):
                    all_onclick_funcs.add(fn)

DOM_BUILTINS = {"return", "if", "for", "while", "switch", "console", "getElementById", "querySelector", "querySelectorAll", "setAttribute", "removeAttribute", "stopPropagation", "preventDefault", "focus", "blur", "click", "showModal", "close"}

missing_funcs = []
for fn in sorted(all_onclick_funcs):
    if fn in DOM_BUILTINS:
        continue
    # Check if defined as function fn(), window.fn =, const fn =, let fn =, var fn =
    def_patterns = [
        rf'function\s+{fn}\s*\(',
        rf'window\.{fn}\s*=',
        rf'const\s+{fn}\s*=',
        rf'let\s+{fn}\s*=',
        rf'var\s+{fn}\s*='
    ]
    is_found = False
    for pat in def_patterns:
        if re.search(pat, js_content):
            is_found = True
            break
    if not is_found:
        missing_funcs.append(fn)

print(f"Total UI button onclick functions checked: {len(all_onclick_funcs)}")
if missing_funcs:
    print("❌ Missing function definitions found:")
    for mf in missing_funcs:
        print(f"  - {mf}")
else:
    print("✅ All UI button handler functions are defined and bound globally!")
