// ---- Imports & setup --------------------------------------------------------
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());            // autorise le front en dev
app.use(express.json());    // JSON body parser

// ---- Fichier des favoris ----------------------------------------------------
const favoritesFile = path.join(__dirname, 'favorites.json');

// Helpers I/O JSON avec auto-création
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
    u.hash = ''; // retire le fragment
    // retire les paramètres UTM
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

app.get('/api/hello', (_req, res) => {
  res.json({ message: 'Hello world' });
});

// Actus Reddit (tu pourras agréger d’autres sources plus tard)
app.get('/api/news', async (_req, res) => {
  try {
    const response = await fetch('https://www.reddit.com/r/marketing/new.json');
    const data = await response.json();

    const articles = (data?.data?.children || []).map(post => ({
      title: post?.data?.title ?? 'Untitled',
      source: 'Reddit',
      url: `https://www.reddit.com${post?.data?.permalink ?? ''}`
    })).filter(a => a.url.startsWith('https://www.reddit.com/'));

    res.json(articles);
  } catch (error) {
    console.error('Erreur /api/news :', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des actualités.' });
  }
});

// Favoris - liste
app.get('/api/favorites', async (_req, res) => {
  try {
    const favorites = await readFavorites();
    res.json(favorites);
  } catch (err) {
    console.error('Erreur GET /api/favorites :', err);
    res.status(500).json({ error: 'Impossible de lire les favoris' });
  }
});

// Favoris - ajout (anti-doublon par URL normalisée -> id)
app.post('/api/favorites', async (req, res) => {
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
      savedAt: new Date().toISOString()
    };

    favorites.push(newFavorite);
    await writeFavorites(favorites);

    res.status(201).json(newFavorite);
  } catch (err) {
    console.error('Erreur POST /api/favorites :', err);
    res.status(500).json({ error: 'Erreur écriture favoris' });
  }
});

// Favoris - suppression par id
app.delete('/api/favorites/:id', async (req, res) => {
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
    res.status(500).json({ error: 'Erreur écriture favoris' });
  }
});

// ---- Démarrage serveur ------------------------------------------------------
const PORT = process.env.PORT || 4000; 
app.listen(PORT, () => {
  console.log(` Backend up on http://localhost:${PORT}`);
});
