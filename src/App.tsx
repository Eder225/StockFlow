import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './auth'
import Login from './pages/Login'
import Layout from './pages/Layout'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import StockManager from './pages/StockManager'
import Sales from './pages/Sales'
import Repairs from './pages/Repairs'
import History from './pages/History'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import ErrorBoundary from './components/ErrorBoundary'

function RequireAuth({ children }: { children: React.ReactElement }) {
  if (!isAuthenticated()) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="stock" element={<StockManager />} />
          <Route path="sales" element={<Sales />} />
          <Route path="repairs" element={<Repairs />} />
          <Route path="history" element={<History />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  )
}

export default App
