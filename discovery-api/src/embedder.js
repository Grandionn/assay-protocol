// src/embedder.js
// Wraps @xenova/transformers (all-MiniLM-L6-v2) for local, offline embedding generation.
// Produces 384-dimensional L2-normalised vectors — no external API dependency.
// Model files (~90 MB) are downloaded from HuggingFace on first call and cached in .cache/.

let _pipeline = null;

async function _loadPipeline() {
  if (_pipeline) return _pipeline;

  // Dynamic import so Jest can mock this module cleanly and the CJS/ESM
  // boundary in @xenova/transformers is handled correctly.
  const { pipeline, env } = await import('@xenova/transformers');

  // Cache downloaded model files in the project directory
  env.cacheDir = './.cache';

  console.log('Loading all-MiniLM-L6-v2 embedding model (one-time download ~90 MB)…');
  _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('Embedding model ready.');

  return _pipeline;
}

/**
 * Generate a normalised 384-dimensional embedding for the given text.
 * Mean-pooling + L2 normalisation are applied so dot product == cosine similarity.
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const extractor = await _loadPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Release the cached pipeline (useful in tests / long-running processes).
 */
function resetPipeline() {
  _pipeline = null;
}

module.exports = { getEmbedding, resetPipeline };
