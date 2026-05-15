const express = require('express');
const store = require('../vectorStore');

const router = express.Router();

const BADGE_WIDTH = 200;
const BADGE_HEIGHT = 20;
const LEFT_WIDTH = 88;
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

  return '#6b7280';
}

function renderBadgeSvg(valueText, valueColor) {
  const labelText = 'Assay Score';
  const ariaLabel = `${labelText}: ${valueText}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" role="img" aria-label="${escapeXml(
    ariaLabel,
  )}">
  <defs>
    <clipPath id="badge-clip">
      <rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" rx="3" ry="3" />
    </clipPath>
  </defs>
  <g clip-path="url(#badge-clip)">
    <rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" fill="#1a1a2e" />
    <rect x="${LEFT_WIDTH}" width="${RIGHT_WIDTH}" height="${BADGE_HEIGHT}" fill="${valueColor}" />
  </g>
  <g fill="#ffffff" font-family="Verdana, DejaVu Sans, sans-serif" font-size="11">
    <text x="${LEFT_WIDTH / 2}" y="14" text-anchor="middle">${escapeXml(labelText)}</text>
    <text x="${LEFT_WIDTH + RIGHT_WIDTH / 2}" y="14" text-anchor="middle">${escapeXml(valueText)}</text>
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
    return res.status(200).send(renderBadgeSvg('not found', '#6b7280'));
  }

  try {
    const entry = await store.get(normalizedAddress);

    if (!entry?.metadata) {
      return res.status(200).send(renderBadgeSvg('not found', '#6b7280'));
    }

    const rawScore = Number(entry.metadata.assayScore ?? 0);
    const displayScore = Math.max(0, Math.round(rawScore / 10));
    const valueText = `${displayScore.toLocaleString()} / 1,000`;
    const valueColor = resolveScoreColor(displayScore);

    return res.status(200).send(renderBadgeSvg(valueText, valueColor));
  } catch (error) {
    console.warn(`[badge] Failed to render badge for ${normalizedAddress}:`, error.message);
    return res.status(200).send(renderBadgeSvg('not found', '#6b7280'));
  }
});

module.exports = router;
