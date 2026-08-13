const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: true
    }
  });

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024" fill="none">
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

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body, html { margin: 0; padding: 0; overflow: hidden; background: transparent; }
        svg { width: 1024px; height: 1024px; display: block; }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  const tempHtml = path.join(__dirname, 'temp.html');
  fs.writeFileSync(tempHtml, htmlContent, 'utf8');

  win.loadURL('file://' + tempHtml);

  win.webContents.once('did-finish-load', async () => {
    // Wait for rendering and glows to finish
    await new Promise(r => setTimeout(r, 800));
    
    const image = await win.capturePage();
    const pngBuffer = image.toPNG();

    const buildDir = path.join(__dirname, '../build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // Save high-resolution PNG
    const pngPath = path.join(buildDir, 'icon.png');
    fs.writeFileSync(pngPath, pngBuffer);
    console.log('[Icon] Saved build/icon.png (1024x1024)');

    // Save a copy to the root directory for runtime use
    fs.writeFileSync(path.join(__dirname, '../icon.png'), pngBuffer);
    console.log('[Icon] Saved root icon.png');

    // Clean up temporary HTML file
    fs.unlinkSync(tempHtml);

    // Build icon.icns on macOS using built-in command lines
    if (process.platform === 'darwin') {
      try {
        console.log('[Icon] Creating icon.icns using sips and iconutil...');
        const iconsetDir = path.join(buildDir, 'icon.iconset');
        if (fs.existsSync(iconsetDir)) {
          fs.rmSync(iconsetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(iconsetDir, { recursive: true });

        // Resize into various sizes needed by macOS iconset guidelines
        const sizes = [
          { size: 16, name: 'icon_16x16.png' },
          { size: 32, name: 'icon_16x16@2x.png' },
          { size: 32, name: 'icon_32x32.png' },
          { size: 64, name: 'icon_32x32@2x.png' },
          { size: 128, name: 'icon_128x128.png' },
          { size: 256, name: 'icon_128x128@2x.png' },
          { size: 256, name: 'icon_256x256.png' },
          { size: 512, name: 'icon_256x256@2x.png' },
          { size: 512, name: 'icon_512x512.png' },
          { size: 1024, name: 'icon_512x512@2x.png' }
        ];

        for (const s of sizes) {
          execSync(`sips -z ${s.size} ${s.size} "${pngPath}" --out "${path.join(iconsetDir, s.name)}"`);
        }

        // Generate icns
        execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(buildDir, 'icon.icns')}"`);
        console.log('[Icon] Successfully generated build/icon.icns');

        // Clean up iconset folder
        fs.rmSync(iconsetDir, { recursive: true, force: true });
      } catch (err) {
        console.error('[Icon] Failed to compile icon.icns:', err);
      }
    }

    app.quit();
  });
});
