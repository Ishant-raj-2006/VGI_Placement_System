import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI crash', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth-wrap"><div className="auth-card center stack">
        <h1>Something went wrong</h1>
        <p className="muted">The page hit an unexpected error. Your data is safe. Reload to continue.</p>
        <div><button className="btn btn-primary" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>Reload</button></div>
      </div></div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
