import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Nodes from './pages/Nodes';
import NodeEdit from './pages/NodeEdit';
import RouteList from './pages/RouteList';
import RouteEdit from './pages/RouteEdit';
import Logs from './pages/Logs';
import Settings from './pages/Settings';

// 受保护路由
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// 登录页 (已登录则跳转)
function LoginRoute() {
  const { token } = useAuth();
  if (token) {
    return <Navigate to="/" replace />;
  }
  return <Login />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="nodes" element={<Nodes />} />
            <Route path="nodes/new" element={<NodeEdit />} />
            <Route path="nodes/:id/edit" element={<NodeEdit />} />
            <Route path="routes" element={<RouteList />} />
            <Route path="routes/new" element={<RouteEdit />} />
            <Route path="routes/:id/edit" element={<RouteEdit />} />
            <Route path="logs" element={<Logs />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
