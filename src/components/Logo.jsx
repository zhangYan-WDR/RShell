import React from 'react';

export default function Logo({ size = 24, style = {} }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      <defs>
        {/* Deep macOS Dark Metallic Gradient */}
        <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e2230" />
          <stop offset="50%" stopColor="#12151f" />
          <stop offset="100%" stopColor="#080a0f" />
        </linearGradient>

        {/* High-tech Border Glow */}
        <linearGradient id="border-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.5)" />
        </linearGradient>

        {/* Neon Cyan & Purple Laser Gradient for R */}
        <linearGradient id="neon-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="60%" stopColor="#0077ff" />
          <stop offset="100%" stopColor="#7000ff" />
        </linearGradient>

        {/* Drop Shadow for Depth */}
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.4" />
        </filter>

        {/* Neon Glow Filter */}
        <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main Squircle Shape (macOS Big Sur rounded corners style) */}
      <rect 
        x="2" 
        y="2" 
        width="96" 
        height="96" 
        rx="22" 
        fill="url(#bg-grad)" 
        stroke="url(#border-grad)" 
        strokeWidth="1.5" 
        filter="url(#shadow)" 
      />

      {/* Inside Glossy Highlight Reflection */}
      <path 
        d="M2.5 24C2.5 12.1259 12.1259 2.5 24 2.5H76C87.8741 2.5 97.5 12.1259 97.5 24V40C97.5 40 70 30 50 30C30 30 2.5 40 2.5 40V24Z" 
        fill="white" 
        fillOpacity="0.03" 
      />

      {/* Stylized Glowing RShell Logo */}
      <g filter="url(#neon-glow)">
        {/* Left Vertical Pillar of 'R' */}
        <rect x="32" y="28" width="7" height="44" rx="2" fill="url(#neon-grad)" />

        {/* Top Loop of 'R' */}
        <path 
          d="M32 28 H52 C60 28 65 33 65 40 C65 47 60 52 52 52 H32" 
          fill="none" 
          stroke="url(#neon-grad)" 
          strokeWidth="7" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />

        {/* Leg of 'R' styled as a terminal caret > */}
        <path 
          d="M46 52 L62 70" 
          fill="none" 
          stroke="url(#neon-grad)" 
          strokeWidth="7" 
          strokeLinecap="round" 
        />

        {/* Prompt symbol '>' */}
        <path 
          d="M71 53 L77 57 L71 61" 
          fill="none" 
          stroke="#00e5ff" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />

        {/* Blinking Underscore '_' */}
        <line 
          x1="80" 
          y1="61" 
          x2="87" 
          y2="61" 
          stroke="#00e5ff" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
        />
      </g>
    </svg>
  );
}
