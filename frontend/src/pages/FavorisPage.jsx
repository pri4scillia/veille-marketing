// frontend/src/pages/FavorisPage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config';
import '../index.css';

export default function FavorisPage() {
  const [favoris, setFavoris] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    setErrMsg('');
    fetch(`${API_URL}/api/favorites`)
      .then(r => {
        if (!r.ok) throw new Error('Réponse invalide');
        return r.json();
      })
      .then(data => setFavoris(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('Erreur chargement favoris :', err);
        setErrMsg('Impossible de charger les favoris');
      })
      .finally(() => setLoading(false));
  }, []);

  const retirer = (id) => {
    fetch(`${API_URL}/api/favorites/${id}`, { method: 'DELETE' })
      .then(r => {
        if (!r.ok) throw new Error('Suppression impossible');
        setFavoris(prev => prev.filter(f => f.id !== id));
      })
      .catch(err => {
        console.error('Erreur suppression favori :', err);
        setErrMsg("Erreur lors de la suppression");
      });
  };

  return (
    <div className="container-centered">
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/">← Retour</Link>
      </p>

      <h1 className="page-title">Mes Favoris</h1>

      {loading && <div>Chargement…</div>}
      {!loading && errMsg && <div style={{ color: '#ff6b6b' }}>{errMsg}</div>}

      {!loading && !errMsg && (
        favoris.length === 0 ? (
          <p style={{ opacity: .75 }}>Aucun favori enregistré.</p>
        ) : (
          <ul className="list-clean">
            {favoris.map((fav) => (
              <li key={fav.id} className="card-item">
                <div style={{ marginBottom: 6 }}>
                  <a href={fav.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                    {fav.title}
                  </a>
                  <span className="badge-src">{fav.source}</span>
                </div>
                <button className="btn-dark-soft" onClick={() => retirer(fav.id)}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
