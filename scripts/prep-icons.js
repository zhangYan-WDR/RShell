const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Vector SVG source for RShell logo
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" fill="none">
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e2230" />
      <stop offset="50%" stop-color="#12151f" />
      <stop offset="100%" stop-color="#080a0f" />
    </linearGradient>
    <linearGradient id="border-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.15)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.5)" />
    </linearGradient>
    <linearGradient id="neon-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00f0ff" />
      <stop offset="60%" stop-color="#0077ff" />
      <stop offset="100%" stop-color="#7000ff" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.4" />
    </filter>
    <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect x="2" y="2" width="96" height="96" rx="22" fill="url(#bg-grad)" stroke="url(#border-grad)" stroke-width="1.5" filter="url(#shadow)" />
  <path d="M2.5 24C2.5 12.1259 12.1259 2.5 24 2.5H76C87.8741 2.5 97.5 12.1259 97.5 24V40C97.5 40 70 30 50 30C30 30 2.5 40 2.5 40V24Z" fill="white" fill-opacity="0.03" />
  <g filter="url(#neon-glow)">
    <rect x="32" y="28" width="7" height="44" rx="2" fill="url(#neon-grad)" />
    <path d="M32 28 H52 C60 28 65 33 65 40 C65 47 60 52 52 52 H32" fill="none" stroke="url(#neon-grad)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M46 52 L62 70" fill="none" stroke="url(#neon-grad)" stroke-width="7" stroke-linecap="round" />
    <path d="M71 53 L77 57 L71 61" fill="none" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="80" y1="61" x2="87" y2="61" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round" />
  </g>
</svg>`;

// Write icon.svg
fs.writeFileSync(path.join(buildDir, 'icon.svg'), svgContent, 'utf8');
console.log('Successfully generated build/icon.svg');

// If icon.png exists in root (from client-side generation), copy it to build/icon.png
const rootIconPath = path.join(__dirname, '../icon.png');
if (fs.existsSync(rootIconPath)) {
  fs.copyFileSync(rootIconPath, path.join(buildDir, 'icon.png'));
  console.log('Successfully copied icon.png to build/icon.png');
} else {
  // If not, write a dummy file or copy if possible, but svg is preferred anyway
}
