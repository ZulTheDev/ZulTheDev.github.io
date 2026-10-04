import React from 'react';
import { createRoot } from 'react-dom/client';
import PortfolioApp from './App.jsx';
import './style.css';
import './responsive.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Portfolio root element was not found.');
}

createRoot(root).render(
  <React.StrictMode>
    <PortfolioApp />
  </React.StrictMode>
);
