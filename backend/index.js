// backend/index.js
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json());

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// /api/news via RSS (pas d'auth Reddit, pas de 403)
app.get('/api/news', async (_req, res, next) => {
  try {
    const feed = await parser.parseURL('https://www.reddit.com/r/marketing/.rss');
    const articles = (feed.items || []).map(it => ({
      title: it.title || 'Untitled',
      source: 'Reddit',
      url: it.link || '',
    })).filter(a => a.url);
    res.json(articles);
  } catch (err) {
    console.error('Erreur /api/news (RSS):', err);
    next(err);
  }
});

// Middleware global d’erreur
app.use((err, _req, res, _next) => {
  console.error('Erreur non gérée :', err);
  res.status(500).json({ error: 'Une erreur interne est survenue' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend up on http://localhost:${PORT}`);
});
