const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const agentsRouter = require('./routes/agents');
const discoverRouter = require('./routes/discover');
const transactionsRouter = require('./routes/transactions');

const app = express();

function rateLimitHandler(_req, res) {
  res.status(429).json({ error: 'Too many requests, please try again later.' });
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: rateLimitHandler,
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  handler: rateLimitHandler,
});

app.use(cors());
app.use(express.json());
app.use(generalLimiter);

app.get('/health', (_req, res) => {
  const { size } = require('./vectorStore');
  res.json({ status: 'ok', agentsIndexed: size() });
});

app.use('/agents', agentsRouter);
app.use('/discover', searchLimiter);
app.use('/discover', discoverRouter);
app.use('/transactions', transactionsRouter);

module.exports = app;
