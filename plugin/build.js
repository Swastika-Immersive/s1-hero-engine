import fs from 'fs';
import path from 'path';

const distPath = path.resolve('dist');
const htmlPath = path.join(distPath, 'ui.html');
const sourceHtmlPath = path.resolve('ui.html');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// Copy ui.html to dist
fs.copyFileSync(sourceHtmlPath, htmlPath);

// Copy icon files
fs.copyFileSync(path.resolve('icon.svg'), path.join(distPath, 'icon.svg'));
fs.copyFileSync(path.resolve('icon16.png'), path.join(distPath, 'icon16.png'));
fs.copyFileSync(path.resolve('icon48.png'), path.join(distPath, 'icon48.png'));
fs.copyFileSync(path.resolve('icon128.png'), path.join(distPath, 'icon128.png'));

console.log('✅ Copied ui.html and icons to dist');
