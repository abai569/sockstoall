import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Nodes from './pages/Nodes';
import RouteList from './pages/RouteList';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Shop from './pages/Shop';
import Orders from './pages/Orders';
import AdminPackagesPage from './pages/AdminPackagesPage';
import AdminOrdersPage from './pages/AdminOrdersPage';
import AdminUsers from './pages/AdminUsers';
import AdminServers from './pages/AdminServers';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { token } = useAuth();
  if (token) return <Navigate to="/" replace />;
  return <Login />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, isAdmin, role } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (role === null) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="nodes" element={<Nodes />} />
            <Route path="routes" element={<RouteList />} />
            <Route path="shop" element={<Shop />} />
            <Route path="orders" element={<Orders />} />
            <Route path="logs" element={<AdminRoute><Logs /></AdminRoute>} />
            <Route path="admin/packages" element={<AdminRoute><AdminPackagesPage /></AdminRoute>} />
            <Route path="admin/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
            <Route path="admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="admin/servers" element={<AdminRoute><AdminServers /></AdminRoute>} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
