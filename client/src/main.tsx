import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { DmRoute } from './routes/DmRoute';
import { DmDataRoute } from './routes/DmDataRoute';
import { PlayerRoute } from './routes/PlayerRoute';
import './styles.css';

function Home() {
  return (
    <div className="home">
      <h1>DnD App v2</h1>
      <p>Pick how you're joining the table:</p>
      <div className="home-links">
        <Link className="btn big" to="/dm">
          I'm the DM
        </Link>
        <Link className="btn big" to="/join">
          I'm a Player
        </Link>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dm" element={<DmRoute />} />
        <Route path="/dm/data" element={<DmDataRoute />} />
        <Route path="/join" element={<PlayerRoute />} />
        <Route path="/play" element={<PlayerRoute />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
