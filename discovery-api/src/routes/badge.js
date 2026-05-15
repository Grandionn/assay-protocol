const express = require('express');
const store = require('../vectorStore');

const router = express.Router();

const BADGE_WIDTH = 240;
const BADGE_HEIGHT = 28;
const LEFT_WIDTH = 108;
const RIGHT_WIDTH = BADGE_WIDTH - LEFT_WIDTH;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolveScoreColor(score) {
  if (score >= 700) {
    return '#22c55e';
  }

  if (score >= 400) {
    return '#3b82f6';
  }

  return '#94a3b8';
}

function renderBadgeSvg(valueText, valueColor) {
  const labelText = 'ASSAY';
  const ariaLabel = `${labelText}: ${valueText}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" role="img" aria-label="${escapeXml(
    ariaLabel,
  )}">
  <defs>
    <linearGradient id="badge-bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f0f23" />
      <stop offset="100%" stop-color="#1a1a3e" />
    </linearGradient>
    <linearGradient id="badge-prism" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <filter id="badge-shadow" x="-10%" y="-20%" width="120%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.3" />
    </filter>
  </defs>
  <g filter="url(#badge-shadow)">
    <rect x="0.5" y="0.5" width="239" height="27" rx="6" ry="6" fill="url(#badge-bg)" stroke="#6366f1" stroke-opacity="0.3" />
    <polygon points="16,14 24,6 32,14 24,22" fill="url(#badge-prism)" />
    <text
      x="42"
      y="17"
      fill="#ffffff"
      font-family="system-ui, -apple-system, sans-serif"
      font-size="10"
      font-weight="700"
      letter-spacing="1"
    >
      ${escapeXml(labelText)}
    </text>
    <line x1="${LEFT_WIDTH}" y1="7" x2="${LEFT_WIDTH}" y2="21" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" />
    <text
      x="${LEFT_WIDTH + RIGHT_WIDTH / 2}"
      y="17"
      text-anchor="middle"
      fill="${valueColor}"
      font-family="system-ui, -apple-system, sans-serif"
      font-size="11"
      font-weight="700"
    >
      ${escapeXml(valueText)}
    </text>
  </g>
</svg>`;
}

router.get('/:address', async (req, res) => {
  const rawAddress = typeof req.params.address === 'string' ? req.params.address.trim() : '';
  const normalizedAddress = rawAddress.toLowerCase();

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!normalizedAddress) {
    return res.status(200).send(renderBadgeSvg('Not Found', '#ef4444'));
  }

  try {
    const entry = await store.get(normalizedAddress);

    if (!entry?.metadata) {
      return res.status(200).send(renderBadgeSvg('Not Found', '#ef4444'));
    }

    const rawScore = Number(entry.metadata.assayScore ?? 0);
    const displayScore = Math.max(0, Math.round(rawScore / 10));
    const valueText = `${displayScore.toLocaleString()} / 1,000`;
    const valueColor = resolveScoreColor(displayScore);

    return res.status(200).send(renderBadgeSvg(valueText, valueColor));
  } catch (error) {
    console.warn(`[badge] Failed to render badge for ${normalizedAddress}:`, error.message);
    return res.status(200).send(renderBadgeSvg('Not Found', '#ef4444'));
  }
});

module.exports = router;
