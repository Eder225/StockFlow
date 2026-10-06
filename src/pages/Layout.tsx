import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, Wrench, History, BarChart3, Settings, Boxes, LogOut } from 'lucide-react'
import { markLoggedOut } from '../auth'

const navItems = [
  { icon: LayoutDashboard, label: 'Tableau de bord', path: '/app' },
  { icon: Package, label: 'Produits', path: '/app/products' },
  { icon: Boxes, label: 'Gestion des stocks', path: '/app/stock' },
  { icon: ShoppingCart, label: 'Ventes', path: '/app/sales' },
  { icon: Wrench, label: 'Réparations', path: '/app/repairs' },
  { icon: History, label: 'Historique', path: '/app/history' },
  { icon: BarChart3, label: 'Rapports', path: '/app/reports' },
  { icon: Settings, label: 'Paramètres', path: '/app/settings' },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const activePath = location.pathname || '/app'
  const [shopName, setShopName] = useState('Ma Boutique')

  useEffect(() => {
    window.electronAPI.settings.getUser().then((user) => {
      if (user?.shop_name) setShopName(user.shop_name)
    })
  }, [])

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <Package size={24} style={{ color: 'var(--color-primary)' }} />
          <span style={styles.sidebarLogo}>StockFlow</span>
        </div>
        <nav style={styles.nav}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activePath === item.path
            return (
              <button
                key={item.path}
                style={{
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : {}),
                }}
                onClick={() => navigate(item.path)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div style={styles.mainArea}>
        <header style={styles.header}>
          <span style={styles.shopName}>{shopName}</span>
          <button style={styles.logoutBtn} onClick={() => { markLoggedOut(); navigate('/') }}>
            <LogOut size={16} /> Déconnexion
          </button>
        </header>

        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', height: '100vh', overflow: 'hidden' },
  sidebar: { width: 240, background: 'var(--color-white)', borderRight: '1px solid var(--color-gray-200)', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sidebarHeader: { padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--color-gray-200)' },
  sidebarLogo: { fontSize: 20, fontWeight: 700, color: 'var(--color-gray-900)' },
  nav: { flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--color-gray-600)', fontWeight: 500, textAlign: 'left', width: '100%', transition: 'all 0.15s' },
  navItemActive: { background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 600 },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: 'var(--color-white)', borderBottom: '1px solid var(--color-gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  shopName: { fontSize: 55, fontWeight: 700, color: 'var(--color-gray-900)' },
  logoutBtn: {
    position: 'absolute', right: 16, display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', border: '1px solid var(--color-gray-300)', background: '#fff',
    borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--color-gray-600)', cursor: 'pointer',
  },
  content: { flex: 1, overflow: 'auto', padding: 24 },
}
