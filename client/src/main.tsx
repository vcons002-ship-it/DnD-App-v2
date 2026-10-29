import {LegacyModeControl,RenderingModeClass,RenderingStartupGate} from './components/LegacyModeControl';
import {registerAssetCache} from './lib/registerAssetCache';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppDialog } from './components/AppDialog';
import './styles.css';

// Do not even import campaign rendering until the startup mode is selected.
const DmRoute=React.lazy(()=>import('./routes/DmRoute').then(m=>({default:m.DmRoute})));
const DmDataRoute=React.lazy(()=>import('./routes/DmDataRoute').then(m=>({default:m.DmDataRoute})));
const DmLibraryRoute=React.lazy(()=>import('./routes/DmLibraryRoute').then(m=>({default:m.DmLibraryRoute})));
const PlayerRoute=React.lazy(()=>import('./routes/PlayerRoute').then(m=>({default:m.PlayerRoute})));

registerAssetCache();

function Home() {
  return (
    <div className="home">
      <LegacyModeControl/>
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
      <ErrorBoundary>
        <AppDialog />
        <RenderingModeClass/>
        <RenderingStartupGate><React.Suspense fallback={<div className="loading">Loading table…</div>}><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dm" element={<DmRoute />} />
          <Route path="/dm/data" element={<DmDataRoute />} />
          <Route path="/dm/library" element={<DmLibraryRoute />} />
          <Route path="/join" element={<PlayerRoute />} />
          <Route path="/play" element={<PlayerRoute />} />
        </Routes></React.Suspense></RenderingStartupGate>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
