const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
}));
app.use(express.json());

// Ping racine
app.get('/', (_req, res) => {
  res.send('Bienvenue sur le backend !');
});

/**
 * /api/news
 * 1) Tente Reddit direct
 * 2) Si 403/blocked, fallback via proxy public r.jina.ai
 */
app.get('/api/news', async (_req, res, next) => {
  const REDDIT_JSON = 'https://www.reddit.com/r/marketing/new.json?raw_json=1';
  const PROXY_JSON  = 'https://r.jina.ai/http://www.reddit.com/r/marketing/new.json?raw_json=1';

  async function fetchJson(url) {
    const r = await fetch(url, {
      headers: {
        
        'User-Agent': 'veille-marketing/1.0 (+https://example.com)'
      }
    });
    const text = await r.text(); 
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${r.statusText} — ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON parse error: ${e.message} — ${text.slice(0, 200)}`);
    }
  }

  try {
    let data;
    try {
      // 1) essai direct
      data = await fetchJson(REDDIT_JSON);
    } catch (e) {
      console.warn('Reddit direct bloqué, fallback proxy:', e.message);
      // 2) fallback proxy
      data = await fetchJson(PROXY_JSON);
    }

    const articles = (data?.data?.children || [])
      .map(post => ({
        title:  post?.data?.title ?? 'Untitled',
        source: 'Reddit',
        url:    `https://www.reddit.com${post?.data?.permalink ?? ''}`,
      }))
      .filter(a => a.url.startsWith('https://www.reddit.com/'));

    res.json(articles);
  } catch (error) {
    console.error('Erreur /api/news :', error);
    next(error); 
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
