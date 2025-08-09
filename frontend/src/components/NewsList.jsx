import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import '../index.css';

/**
 * On charge:
 *  - la liste des news
 *  - la liste des favoris (pour savoir quoi est déjà ajouté)
 * Le bouton affiche "Ajouté ✓" et est désactivé si l'article (par URL) est déjà en favoris.
 * Quand on retourne de /favoris après des suppressions, le composant est remonté
 * => la liste des favoris est rechargée => les boutons redeviennent normaux.
 */
export default function NewsList() {
  const [news, setNews] = useState([]);
  const [favUrls, setFavUrls] = useState(new Set()); // URLs déjà en favoris
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');

  // charge les favoris (on stocke juste les URLs pour aller vite)
  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/favorites`);
      if (!res.ok) throw new Error('Erreur chargement favoris');
      const data = await res.json();
      const urls = new Set((data || []).map(f => f.url));
      setFavUrls(urls);
    } catch (e) {
      console.error('Erreur GET favoris :', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrMsg('');
      try {
        const [newsRes] = await Promise.all([
          axios.get(`${API_URL}/api/news`),
          loadFavorites()
        ]);
        setNews(newsRes.data || []);
      } catch (err) {
        console.error('Erreur chargement news :', err);
        setErrMsg("Impossible de charger les actualités.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadFavorites]);

  // Ajoute si pas déjà favori
  const ajouterAuxFavoris = async (article) => {
    if (favUrls.has(article.url)) return; // déjà ajouté

    try {
      const res = await fetch(`${API_URL}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          source: article.source,
          url: article.url
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de l'ajout aux favoris");
      }
      setFavUrls(prev => new Set(prev).add(article.url));
      console.log(` Ajouté aux favoris : ${article.title}`);
    } catch (err) {
      console.error('Erreur POST favoris :', err);
    }
  };

  if (loading) return <div>Chargement…</div>;
  if (errMsg)   return <div style={{ color: '#ff6b6b' }}>{errMsg}</div>;

  return (
    <ul className="list-clean">
      {news.map((article, i) => {
        const alreadyFav = favUrls.has(article.url);
        return (
          <li key={i} className="card-item">
            <div style={{ marginBottom: 6 }}>
              <a href={article.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                {article.title}
              </a>
              <span className="badge-src">{article.source}</span>
            </div>

            <button
              className="btn-dark-soft"
              onClick={() => ajouterAuxFavoris(article)}
              disabled={alreadyFav}
              title={alreadyFav ? 'Déjà en favoris' : 'Ajouter aux favoris'}
            >
              {alreadyFav ? 'Ajouté ✓' : 'Ajouter aux favoris'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
