const fs = require('fs');
const path = require('path');

const appJsxPath = path.join(__dirname, 'src', 'App.jsx');
const stampPath = path.join(__dirname, 'stamp_base64.txt');

const stampBase64 = fs.readFileSync(stampPath, 'utf8').trim();
let appJsx = fs.readFileSync(appJsxPath, 'utf8');

// 匹配 const STAMP_BASE64 = `...`; 包含換行或任何字元
const regex = /const STAMP_BASE64 = `[^`]*`;/;
const replacement = `const STAMP_BASE64 = \`data:image/png;base64,${stampBase64}\`;`;

if (regex.test(appJsx)) {
    appJsx = appJsx.replace(regex, replacement);
    fs.writeFileSync(appJsxPath, appJsx);
    console.log('Successfully updated STAMP_BASE64 in App.jsx');
} else {
    console.error('Could not find STAMP_BASE64 definition in App.jsx');
    process.exit(1);
}
