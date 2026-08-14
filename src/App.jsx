import React, { useState, useEffect } from 'react';
import SSHDashboard from './components/SSHDashboard';
import Logo from './components/Logo';
import { Sun, Moon } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('rshell:app-theme') || 'dark');
  const [termTheme, setTermTheme] = useState(() => localStorage.getItem('rshell:terminal-theme') || 'cyber-deep');

  useEffect(() => {
    localStorage.setItem('rshell:app-theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('rshell:terminal-theme', termTheme);
  }, [termTheme]);

  useEffect(() => {
    // Generate high-resolution PNG icon from SVG and send to main process for macOS Dock styling
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" fill="none">
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
      </svg>
    `;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 512, 512);
      const dataUrl = canvas.toDataURL('image/png');
      if (window.api && window.api.saveAppIcon) {
        window.api.saveAppIcon(dataUrl);
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-primary)'
    }}>
      {/* macOS Title Bar Area */}
      <div style={{
        height: '38px',
        width: '100%',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '80px', // Left room for macOS traffic lights (red, yellow, green)
        paddingRight: '16px',
        WebkitAppRegion: 'drag',
        flexShrink: 0,
        userSelect: 'none'
      }}>
        {/* App Title */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: '700',
          color: 'var(--text-main)'
        }}>
          <Logo size={16} />
          <span>RShell</span>
        </div>

        {/* Actions Container */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Terminal Theme Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', WebkitAppRegion: 'no-drag' }}>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>终端配色:</label>
            <select
              value={termTheme}
              onChange={(e) => setTermTheme(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-light)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <option value="cyber-deep" style={{ background: '#10121a', color: '#ccd6f6' }}>🌌 科技深蓝</option>
              <option value="soft-green" style={{ background: '#151e18', color: '#cbe3db' }}>🍵 豆沙护眼绿</option>
              <option value="solarized-dark" style={{ background: '#073642', color: '#93a1a1' }}>☀️ 经典暗阳</option>
              <option value="gruvbox" style={{ background: '#282828', color: '#ebdbb2' }}>🍁 复古暖棕</option>
              <option value="nord" style={{ background: '#2e3440', color: '#d8dee9' }}>❄️ 极地冷灰</option>
              <option value="dracula" style={{ background: '#282a36', color: '#f8f8f2' }}>🧛 吸血鬼紫</option>
            </select>
          </div>

          {/* Theme Switcher Button */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-light)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '600',
              gap: '6px',
              WebkitAppRegion: 'no-drag',
              transition: 'all 0.2s'
            }}
          >
            {theme === 'dark' ? (
              <>
                <Sun size={12} color="var(--color-warning)" />
                <span>浅色模式</span>
              </>
            ) : (
              <>
                <Moon size={12} color="var(--color-primary)" />
                <span>深色模式</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Standalone Dashboard View */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative'
      }}>
        <SSHDashboard theme={theme} termTheme={termTheme} />
      </div>
    </div>
  );
}
