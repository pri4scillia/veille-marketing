import React from 'react';
import NewsList from './components/NewsList';
import { Link } from 'react-router-dom';
import './index.css';

export default function App() {
  return (
    <div className="container-centered">
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/favoris">Voir les favoris</Link>
      </p>

      <h1 className="page-title">Ma Veille Marketing</h1>
      <h2 className="section-title">📰 Actualités Marketing</h2>

      <NewsList />
    </div>
  );
}

