/**
 * ⚠️ ROUTING RULES:
 * - Router is in main.tsx. Do NOT add another <BrowserRouter> here or anywhere.
 * - Use <Routes> + <Route> components ONLY. Do NOT use useRoutes().
 * - STATIC IMPORTS ONLY — no React.lazy() or dynamic import().
 * - Import from 'react-router' — NOT 'react-router-dom' (does not exist).
 */
import { Routes, Route, Navigate } from 'react-router';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Stock from '@/pages/Stock';
import Orders from '@/pages/Orders';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function App() {
	return (
		<ThemeProvider>
			<OfflineIndicator />
			<Routes>
			<Route path="/" element={<Navigate to="/dashboard" replace />} />
			<Route path="/login" element={<Login />} />
			<Route
				path="/dashboard"
				element={
					<ProtectedRoute>
						<Dashboard />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/stock"
				element={
					<ProtectedRoute>
						<Stock />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/orders"
				element={
					<ProtectedRoute>
						<Orders />
					</ProtectedRoute>
				}
			/>
			</Routes>
		</ThemeProvider>
	);
}
