// src/app.js
// Express application — exported without .listen() so tests can import it cleanly.

const cors = require('cors');
const express = require('express');
const agentsRouter   = require('./routes/agents');
const discoverRouter = require('./routes/discover');
const transactionsRouter = require('./routes/transactions');

const app = express();

app.use(cors());
app.use(express.json());

// —— Health check ——————————————————————————————————————————————————————————————
app.get('/health', (_req, res) => {
  const { size } = require('./vectorStore');
  res.json({ status: 'ok', agentsIndexed: size() });
});

// —— Routes ———————————————————————————————————————————————————————————————————
app.use('/agents',   agentsRouter);
app.use('/discover', discoverRouter);
app.use('/transactions', transactionsRouter);

module.exports = app;
