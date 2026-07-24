import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate SVG Icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="100" fill="#0f172a"/>
  <rect x="32" y="32" width="448" height="448" rx="80" fill="url(#grad)" opacity="0.15"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
  </defs>

  <!-- Outer Ring / Circle -->
  <circle cx="256" cy="256" r="180" fill="none" stroke="#1e293b" stroke-width="16"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="url(#iconGrad)" stroke-width="12" stroke-dasharray="800" stroke-dashoffset="100"/>

  <!-- Shopping Bag & POS Symbol -->
  <rect x="156" y="180" width="200" height="200" rx="24" fill="url(#iconGrad)"/>
  <path d="M206 180 V150 C206 122 228 100 256 100 C284 100 306 122 306 150 V180" fill="none" stroke="#93c5fd" stroke-width="20" stroke-linecap="round"/>
  
  <!-- Checkmark / Sync Symbol inside -->
  <path d="M206 280 L240 314 L306 248" fill="none" stroke="#ffffff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Status indicator dot -->
  <circle cx="360" cy="150" r="28" fill="#10b981"/>
  <circle cx="360" cy="150" r="16" fill="#ffffff"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);

console.log('SVG icons generated successfully in /public');
