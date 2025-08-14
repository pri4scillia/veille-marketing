// ---- Imports & setup --------------------------------------------------------
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const app = express();

// ---- CORS -------------------------------------------------------------------
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true, // en prod, mets ton domaine Vercel
}));
app.use(express.json());

// ---- Logs simples -----------------------------------------------------------
app.use((req, _res, next) => {
  const t = new Date().toISOString();
  console.log(`[${t}] ${req.method} ${req.url}`);
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

// ---- Utilitaires URL/ID -----------------------------------------------------
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

// ---- Page d’accueil ---------------------------------------------------------
app.get('/', (_req, res) => {
  res.send('Bienvenue sur le backend !');
});


let redditToken = null;      // { access_token, expires_at }
const REDDIT_OAUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const USER_AGENT = 'veille-marketing/1.0 (+https://veille-marketing.vercel.app)';

async function getRedditToken() {
  const now = Date.now();
  if (redditToken && redditToken.expires_at > now + 5000) {
    return redditToken.access_token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET manquants');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const resp = await fetch(REDDIT_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`OAuth Reddit échoué: ${resp.status} ${resp.statusText} — ${txt.slice(0,200)}`);
  }

  const data = await resp.json();
  redditToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000) // ~1h
  };
  return redditToken.access_token;
}

// ---- /api/news --------------------------------------------------------------
app.get('/api/news', async (_req, res, next) => {
  try {
    const token = await getRedditToken();

    const url = 'https://oauth.reddit.com/r/marketing/new.json?limit=30';
    let r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      }
    });

    // Si le token a expiré ou 401 → on retente 1 fois avec un nouveau token
    if (r.status === 401) {
      redditToken = null;
      const token2 = await getRedditToken();
      r = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token2}`,
          'User-Agent': USER_AGENT,
        }
      });
    }

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Reddit ${r.status} ${r.statusText} — ${txt.slice(0,200)}`);
    }

    const data = await r.json();
    const articles = (data?.data?.children || []).map(post => ({
      title: post?.data?.title ?? 'Untitled',
      source: 'Reddit',
      url: `https://www.reddit.com${post?.data?.permalink ?? ''}`,
    }));

    res.json(articles);
  } catch (err) {
    console.error('Erreur /api/news :', err);
    next(err);
  }
});

// ---- Favoris : liste --------------------------------------------------------
app.get('/api/favorites', async (_req, res, next) => {
  try {
    const favorites = await readFavorites();
    res.json(favorites);
  } catch (err) {
    console.error('Erreur GET /api/favorites :', err);
    next(err);
  }
});

// ---- Favoris : ajout --------------------------------------------------------
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

// ---- Favoris : suppression --------------------------------------------------
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
  console.error('Erreur non gérée :', err.stack || err);
  res.status(500).json({ error: 'Une erreur interne est survenue' });
});

// ---- Démarrage serveur ------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(` Backend up on http://localhost:${PORT}`);
});
