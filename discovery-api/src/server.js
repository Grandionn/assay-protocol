const app = require('./app');
const store = require('./vectorStore');
const { seedDirect } = require('./seed');

const PORT = process.env.PORT || 3000;

async function startServer() {
  console.log('Embedding model loads on first request (all-MiniLM-L6-v2, ~90 MB one-time download).');

  await store.load();
  console.log(`Loaded ${store.size()} agents into the in-memory search cache.`);

  if (store.size() === 0) {
    try {
      const indexed = await seedDirect();
      console.log(`Vector store seeded with ${indexed.length} agents on first startup.`);
    } catch (err) {
      console.error('Auto-seed failed:', err.message);
    }
  } else {
    console.log('Existing agents detected. Startup seed skipped.');
  }

  app.listen(PORT, () => {
    console.log(`Assay Discovery API -> http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
