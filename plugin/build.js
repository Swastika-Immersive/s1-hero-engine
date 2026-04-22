import fs from 'fs';
import path from 'path';

const distPath = path.resolve('dist');
const htmlPath = path.join(distPath, 'ui.html');
const jsPath = path.join(distPath, 'ui.js');
const sourceHtmlPath = path.resolve('ui.html');

// Copy ui.html to dist if it doesn't exist
if (!fs.existsSync(htmlPath)) {
  fs.copyFileSync(sourceHtmlPath, htmlPath);
}

// Read the built HTML and JS
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
const jsContent = fs.readFileSync(jsPath, 'utf-8');

// Encode JS as base64 and use data URI to avoid HTML parsing issues
const jsBase64 = Buffer.from(jsContent, 'utf-8').toString('base64');
const dataUri = `data:text/javascript;base64,${jsBase64}`;

const inlineHtml = htmlContent.replace(
  '<script src="./ui.js"></script>',
  `<script src="${dataUri}"></script>`
);

// Write the inlined HTML back
fs.writeFileSync(htmlPath, inlineHtml);

// Delete the external JS file since it's now inlined via data URI
fs.unlinkSync(jsPath);

console.log('✅ Inlined JS into ui.html using data URI');
