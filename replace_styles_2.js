const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Badges border-radius 10px or 12px or 4px -> 9999px
content = content.replace(/border-radius:\s*10px;/g, 'border-radius:9999px;');
content = content.replace(/border-radius:\s*12px;/g, 'border-radius:9999px;');
// For 4px, let's only do it if it's a badge or button.
content = content.replace(/(class="badge[^"]*"[^>]*)border-radius:\s*4px;/g, '$1border-radius:9999px;');

// Cards border-radius 8px -> 12px
content = content.replace(/border-radius:\s*8px;/g, 'border-radius:12px;');

// Box-shadow
content = content.replace(/box-shadow:\s*0\s+2px\s+8px\s+rgba\(0,0,0,0\.08\);/g, 'box-shadow:rgba(5,0,56,0.06) 0px 4px 12px 0px;');

// Badges colors
// 3370: background:#fee2e2; color:#ef4444;
content = content.replace(/background:\s*#fee2e2;\s*color:\s*#ef4444;/g, 'background:#ffc6c6; color:#600000; border:1px solid #ff9999;');
// 3893: background:#e1f5fe; color:#0288d1;
content = content.replace(/background:\s*#e1f5fe;\s*color:\s*#0288d1;/g, 'background:#c3faf5; color:#187574; border:1px solid #0fbcb0;');

// Plus Jakarta Sans -> var(--font-display) (just in case)
content = content.replace(/Plus Jakarta Sans/g, 'var(--font-display)');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Done");
