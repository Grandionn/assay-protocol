// src/server.js
// Entry point — starts the HTTP server and optionally pre-seeds the vector store.

const app  = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Assay Discovery API  →  http://localhost:${PORT}`);
  console.log('Embedding model loads on first request (all-MiniLM-L6-v2, ~90 MB one-time download).');

  if (process.env.AUTO_SEED === 'true') {
    try {
      const { seedDirect } = require('../scripts/seed');
      const count = await seedDirect();
      console.log(`Auto-seeded ${count} sample agents into the vector store.`);
    } catch (err) {
      console.error('Auto-seed failed:', err.message);
    }
  }
});
