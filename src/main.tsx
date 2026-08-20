import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { AppProviders } from './providers';
import { initializeCapacitor } from './lib/capacitor-init';
import { registerServiceWorker } from './register-sw';
import './index.css';

// Initialize native app features (Capacitor)
initializeCapacitor();

// Register service worker for PWA support
registerServiceWorker();

/**
 * ⚠️ ROUTER LIVES HERE — Do NOT add <BrowserRouter>, <Router>, or <MemoryRouter> anywhere else.
 * All route definitions go in App.tsx using <Routes> and <Route>.
 */
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<AppProviders>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</AppProviders>
	</StrictMode>,
);
