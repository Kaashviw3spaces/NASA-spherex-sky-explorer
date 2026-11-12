import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ExplorerPage from './pages/ExplorerPage';
import TargetsPage from './pages/TargetsPage';
import ArchitecturePage from './pages/ArchitecturePage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/targets" element={<TargetsPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
        </Routes>
        <footer className="footer">
          <span>SPHEREx Sky Explorer · Multi-Epoch &amp; 102-Band Spectral Workbench</span>
          <span>WCS TAN 6.2″/px · unWISE Fallback Enabled</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}
