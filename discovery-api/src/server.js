// src/server.js
// Entry point — starts the HTTP server and seeds the in-memory vector store on boot.

const app = require('./app');
const { seedDirect } = require('./seed');

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Assay Discovery API -> http://localhost:${PORT}`);
  console.log('Embedding model loads on first request (all-MiniLM-L6-v2, ~90 MB one-time download).');

  try {
    const indexed = await seedDirect();
    console.log(`Auto-seeded ${indexed.length} sample agents into the vector store.`);
  } catch (err) {
    console.error('Auto-seed failed:', err.message);
  }
});
