// ---- Imports & setup --------------------------------------------------------
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const RSSParser = require('rss-parser'); // <-- RSS au lieu de fetch JSON
const parser = new RSSParser();

const app = express();

// CORS (autorise ton front, ou tout en dev)
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
}));
app.use(express.json());

// ---- Logs simples -----------------------------------------------------------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---- Fichier des favoris ----------------------------------------------------
const favoritesFile = path.join(__dirname, 'favorites.json');

async function readFavorites() {
  try {
    const data = await fsp.readFile(favoritesFile, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fsp.writeFile(favoritesFile, '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}
async function writeFavorites(favs) {
  await fsp.writeFile(favoritesFile, JSON.stringify(favs, null, 2), 'utf-8');
}

// ---- Normalisation URL & ID -------------------------------------------------
const normalizeUrl = (rawUrl) => {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    [...u.searchParams.keys()].forEach(k => {
      if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
    });
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return rawUrl.trim();
  }
};
const idFromUrl = (url) => crypto.createHash('sha1').update(url).digest('hex');

// ---- Routes -----------------------------------------------------------------
app.get('/', (_req, res) => {
  res.send('Bienvenue sur le backend !');
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/**
 * /api/news — via RSS (anti-blocage Reddit)
 * On lit https://www.reddit.com/r/marketing/.rss
 */
app.get('/api/news', async (_req, res, next) => {
  try {
    const feed = await parser.parseURL('https://www.reddit.com/r/marketing/.rss');
    const articles = (feed.items || []).map(item => ({
      title: item.title || 'Untitled',
      source: 'Reddit',
      url: item.link || '',
    })).filter(a => a.url);

    res.json(articles);
  } catch (err) {
    console.error('Erreur /api/news (RSS) :', err);
    next(err);
  }
});

// Favoris - liste
app.get('/api/favorites', async (_req, res, next) => {
  try {
    const favorites = await readFavorites();
    res.json(favorites);
  } catch (err) {
    console.error('Erreur GET /api/favorites :', err);
    next(err);
  }
});

// Favoris - ajout (anti-doublon par URL normalisée -> id)
app.post('/api/favorites', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.url || !body.title) {
      return res.status(400).json({ error: 'Champs manquants (title, url)' });
    }

    const url = normalizeUrl(body.url);
    const id = idFromUrl(url);

    const favorites = await readFavorites();
    if (favorites.some(f => f.id === id)) {
      return res.status(400).json({ error: 'Article déjà en favoris' });
    }

    const newFavorite = {
      id,
      title: body.title,
      source: body.source || 'Unknown',
      url,
      savedAt: new Date().toISOString(),
    };

    favorites.push(newFavorite);
    await writeFavorites(favorites);

    res.status(201).json(newFavorite);
  } catch (err) {
    console.error('Erreur POST /api/favorites :', err);
    next(err);
  }
});

// Favoris - suppression
app.delete('/api/favorites/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const favorites = await readFavorites();
    const newFavorites = favorites.filter(f => f.id !== id);

    if (newFavorites.length === favorites.length) {
      return res.status(404).json({ error: 'Favori introuvable' });
    }

    await writeFavorites(newFavorites);
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur DELETE /api/favorites/:id :', err);
    next(err);
  }
});

// ---- Middleware global d’erreur ---------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Erreur non gérée :', err?.stack || err);
  res.status(500).json({ error: 'Une erreur interne est survenue' });
});

// ---- Démarrage serveur ------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend up on http://localhost:${PORT}`);
});
