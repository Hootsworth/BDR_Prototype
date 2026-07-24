const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Hardcoded hex colors -> CSS variable references
// - #FF6B35, #ff6b35 -> var(--brand-ochre) OR var(--primary) depending on context. Let's use var(--primary)
content = content.replace(/#FF6B35/gi, 'var(--primary)');
// - #FFFAF0, #fffaf0 -> var(--canvas)
content = content.replace(/#FFFAF0/gi, 'var(--canvas)');
// - #FFF5E6, #fff5e6, #FFF0DB, #fff0db -> var(--surface-soft)
content = content.replace(/#(FFF5E6|FFF0DB)/gi, 'var(--surface-soft)');
// - #1a1a2e, #1A1A2E -> var(--primary)
content = content.replace(/#1a1a2e/gi, 'var(--primary)');
// - #4a4a6a -> var(--body)
content = content.replace(/#4a4a6a/gi, 'var(--body)');
// - #8a8aaa -> var(--muted)
content = content.replace(/#8a8aaa/gi, 'var(--muted)');
// - #2ED8A3 -> var(--success)
content = content.replace(/#2ED8A3/gi, 'var(--success)');
// - #FFB347 -> var(--warning)
content = content.replace(/#FFB347/gi, 'var(--warning)');
// - #FF4757 -> var(--error)
content = content.replace(/#FF4757/gi, 'var(--error)');
// - #7C6FEE -> var(--info)
content = content.replace(/#7C6FEE/gi, 'var(--info)');

// 2. Inline border-radius -> rounder values
// Badge border-radius: 6px or 10px or 12px -> 9999px
// I will just replace `border-radius:10px` and similar on badges.
// Looking at grep results, there are things like `border-radius:10px`, `border-radius:12px`, `border-radius:8px`, `border-radius:4px`.
// I will use regex: border-radius:\s*(4px|6px|8px|10px|12px|16px) -> if it's on a button/badge, make it 9999px.
// Wait, the prompt says: "Badge border-radius should be 9999px (pills)" and "Button border-radius should be 9999px (pills)"
// and "border-radius: 8px on cards -> border-radius: 12px or 16px".
// Let's replace any `border-radius:\s*\d+px` in strings that look like badge or button?
// Or we can just manually target the specific replacements requested.

// 3. Hot leads / Cold leads inline background colors on badges/tags.
// "Hot leads: use background: #ffc6c6; color: #600000; border: 1px solid #ff9999"
// "Cold leads: use background: #c3faf5; color: #187574; border: 1px solid #0fbcb0"

// 4. "Plus Jakarta Sans" -> "var(--font-display)"

// Let's save the file back for these.
fs.writeFileSync(filePath, content, 'utf8');
console.log("Done");
