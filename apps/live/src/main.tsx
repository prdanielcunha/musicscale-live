import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './styles.css';
import { App } from './App';

interface RootErrorBoundaryState {
  error: Error | null;
}

class RootErrorBoundary extends React.Component<
  React.PropsWithChildren,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('[MusicScale Live] root runtime error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="center" role="alert">
        <div className="boot-orb" />
        <h1 style={{ margin: '0 0 8px', fontSize: '24px' }}>MusicScale Live</h1>
        <p style={{ maxWidth: '420px', textAlign: 'center' }}>
          Não foi possível iniciar o controle neste navegador. Recarregue a página.
          Se continuar, abra novamente pelo QR do Live Node.
        </p>
        <button className="primary" type="button" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </main>
    );
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('root_not_found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
