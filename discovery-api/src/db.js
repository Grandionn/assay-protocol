const mongoose = require('mongoose');

let connectionPromise = null;
let warnedMissingUri = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    if (!warnedMissingUri) {
      console.warn('[db] MONGODB_URI is not set. Running in in-memory mode only.');
      warnedMissingUri = true;
    }
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(uri)
    .then(() => {
      console.log('[db] Connected to MongoDB.');
      return true;
    })
    .catch((error) => {
      console.error('[db] Failed to connect to MongoDB:', error.message);
      return false;
    })
    .finally(() => {
      connectionPromise = null;
    });

  return connectionPromise;
}

module.exports = { connectDB };
