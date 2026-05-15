import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const publicDir = path.resolve(frontendRoot, 'public');
const sitemapPath = path.resolve(publicDir, 'sitemap.xml');

const SITE_ORIGIN = 'https://assaylabs.xyz';
const API_FALLBACK_URL = 'https://assay-discovery-api.onrender.com';
const STATIC_PATHS = ['/', '/discover', '/register'];
const TODAY = new Date().toISOString().split('T')[0];

function normalizeBaseUrl(value) {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchAgents() {
  const env = loadEnv(process.env.NODE_ENV ?? 'production', frontendRoot, '');
  const apiBaseUrl = normalizeBaseUrl(env.VITE_API_URL || process.env.VITE_API_URL || API_FALLBACK_URL);

  try {
    const response = await fetch(`${apiBaseUrl}/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '',
        topK: 100,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Discovery API returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    console.log(`[sitemap] Loaded ${results.length} agent profiles from ${apiBaseUrl}`);
    return results;
  } catch (error) {
    console.warn(`[sitemap] Falling back to static routes only: ${error.message}`);
    return [];
  }
}

function buildUrlSet(agentResults) {
  const urls = new Map();

  for (const sitePath of STATIC_PATHS) {
    const url = sitePath === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${sitePath}`;
    urls.set(url, url);
  }

  for (const agent of agentResults) {
    const address = typeof agent?.address === 'string' ? agent.address.trim() : '';
    if (!address) {
      continue;
    }

    const url = `${SITE_ORIGIN}/agent/${encodeURIComponent(address)}`;
    urls.set(url, url);
  }

  return Array.from(urls.values());
}

function renderSitemap(urls) {
  const entries = urls
    .map(
      (url) => `  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

async function main() {
  const agentResults = await fetchAgents();
  const urls = buildUrlSet(agentResults);
  const sitemap = renderSitemap(urls);

  await mkdir(publicDir, { recursive: true });
  await writeFile(sitemapPath, sitemap, 'utf8');

  console.log(`[sitemap] Wrote ${urls.length} URL(s) to ${sitemapPath}`);
}

main().catch((error) => {
  console.error('[sitemap] Failed to generate sitemap:', error);
  process.exit(1);
});
