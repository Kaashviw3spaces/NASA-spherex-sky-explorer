import { Component } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
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
          <p style={{ color: '#8b949e', marginBottom: 20 }}>
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

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />
        <main className="main-content">
          <AppErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/explorer" element={<ExplorerPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/scene" element={<ScenePage />} />
              <Route path="/targets" element={<TargetsPage />} />
              <Route path="/architecture" element={<ArchitecturePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
}
