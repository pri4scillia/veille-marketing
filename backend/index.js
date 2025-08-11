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

app.get('/', (_req, res) => {
  res.send('Bienvenue sur le backend !');
});

// Route /api/news avec fetch natif
app.get('/api/news', async (_req, res) => {
  try {
    const response = await fetch('https://www.reddit.com/r/marketing/new.json', {
      headers: {
        'User-Agent': 'veille-marketing/1.0 (+https://example.com)'
      },
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      throw new Error(`Reddit HTTP ${response.status} ${response.statusText} — ${txt.slice(0,200)}`);
    }

    const data = await response.json();
    const articles = (data?.data?.children || []).map(post => ({
      title: post?.data?.title ?? 'Untitled',
      source: 'Reddit',
      url: `https://www.reddit.com${post?.data?.permalink ?? ''}`,
    }));

    res.json(articles);
  } catch (error) {
    console.error('Erreur /api/news :', error);
    res.status(500).json({ error: error.message }); // 🔹 affiche le vrai message
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
