const app = require('./app');
const store = require('./vectorStore');
const { seedDirect } = require('./seed');

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Assay Discovery API -> http://localhost:${PORT}`);
  console.log('Embedding model loads on first request (all-MiniLM-L6-v2, ~90 MB one-time download).');

  store.load();
  console.log(`Loaded ${store.size()} persisted agents from disk.`);

  try {
    const indexed = await seedDirect();
    console.log(`Vector store ready with ${indexed.length} indexed agents after startup seed.`);
  } catch (err) {
    console.error('Auto-seed failed:', err.message);
  }
});