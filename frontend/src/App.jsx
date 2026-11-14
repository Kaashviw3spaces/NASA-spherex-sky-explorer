import MissionsPage from './pages/MissionsPage';
import ExperimentsPage from './pages/ExperimentsPage';
import Experience from './components/Experience';
import LearnPage from './pages/LearnPage';
import { Component } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ExplorerPage from './pages/ExplorerPage';
import TargetsPage from './pages/TargetsPage';
import ArchitecturePage from './pages/ArchitecturePage';
import LibraryPage from './pages/LibraryPage';
import ScenePage from './pages/ScenePage';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AppErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '48px 24px', maxWidth: 720, margin: '0 auto', color: '#f0f6fc', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Explorer Encountered an Error</h2>
          <p style={{ color: '#9aaabd', marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/explorer';
            }}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: 14 }}
          >
            Reload Explorer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RetiredObservationsRoute() {
  const { search } = useLocation();
  return <Navigate to={`/explorer${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />
        <Experience />
        <main className="main-content" id="main-content" tabIndex={-1}>
          <AppErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/spherex" element={<RetiredObservationsRoute />} />
              <Route path="/explorer" element={<ExplorerPage spherex />} />
              <Route path="/legacy-explorer" element={<ExplorerPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/scene" element={<ScenePage />} />
              <Route path="/missions" element={<MissionsPage />} />
              <Route path="/missions/:missionId" element={<MissionsPage />} />
              <Route path="/experiments" element={<ExperimentsPage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/targets" element={<TargetsPage />} />
              <Route path="/architecture" element={<ArchitecturePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppErrorBoundary>
        </main>
        <footer className="site-footer"><Link className="footer-brand" to="/">SPHEREx <span>SKY EXPLORER</span></Link><span>Made for curious minds. Made by curious minds.</span><div><Link to="/architecture">About the data</Link><Link to="/targets">Find a target ↗</Link></div></footer>
      </div>
    </BrowserRouter>
  );
}
