import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Package, ShoppingCart, Wrench, History, X } from 'lucide-react'

const typeLabels: Record<string, string> = {
  product: 'Produits',
  sale: 'Ventes',
  repair: 'Réparations',
  history: 'Historique',
}

const typeIcons: Record<string, typeof Package> = {
  product: Package,
  sale: ShoppingCart,
  repair: Wrench,
  history: History,
}

const typeColors: Record<string, string> = {
  product: 'var(--color-primary)',
  sale: 'var(--color-success)',
  repair: '#9333ea',
  history: 'var(--color-gray-500)',
}

export default function GlobalSearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current as ReturnType<typeof setTimeout>)
    if (!value.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    timerRef.current = setTimeout(() => {
      window.electronAPI.global.search({ query: value }).then((res) => {
        setResults(res)
        setOpen(true)
      })
    }, 200)
  }

  const handleSelect = (item: GlobalSearchResult) => {
    navigate(`/app/${item.destination}`, { state: { highlightId: item.id } })
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const grouped = results.reduce<Record<string, GlobalSearchResult[]>>((acc, item) => {
    if (!acc[item.type]) acc[item.type] = []
    acc[item.type].push(item)
    return acc
  }, {})

  const hasResults = results.length > 0

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.inputWrapper}>
        <Search size={16} style={styles.inputIcon} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (query.trim() && hasResults) setOpen(true) }}
          placeholder="Rechercher..."
          style={styles.input}
        />
        {query && (
          <button style={styles.clearBtn} onClick={handleClear}>
            <X size={14} />
          </button>
        )}
      </div>
      {open && hasResults && (
        <div style={styles.dropdown}>
          {(['product', 'sale', 'repair', 'history'] as const).map((type) => {
            const items = grouped[type]
            if (!items || items.length === 0) return null
            const Icon = typeIcons[type]
            return (
              <div key={type}>
                <div style={styles.groupHeader}>
                  <Icon size={14} style={{ color: typeColors[type] }} />
                  <span style={styles.groupLabel}>{typeLabels[type]}</span>
                  <span style={styles.groupCount}>{items.length}</span>
                </div>
                {items.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    style={styles.resultItem}
                    onClick={() => handleSelect(item)}
                  >
                    <div style={styles.resultContent}>
                      <span style={styles.resultTitle}>{item.title}</span>
                      <span style={styles.resultSubtitle}>{item.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {open && query.trim() && !hasResults && (
        <div style={styles.dropdown}>
          <div style={styles.noResults}>Aucun résultat pour "{query}"</div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: 'relative', flex: 1, maxWidth: 400, margin: '0 24px' },
  inputWrapper: {
    position: 'relative', display: 'flex', alignItems: 'center',
    background: 'var(--color-gray-50)', border: '1px solid var(--color-gray-200)',
    borderRadius: 'var(--radius)', transition: 'border-color 0.15s',
  },
  inputIcon: { position: 'absolute', left: 12, color: 'var(--color-gray-400)', pointerEvents: 'none' },
  input: {
    width: '100%', padding: '8px 36px 8px 36px', border: 'none', outline: 'none',
    background: 'transparent', fontSize: 14, color: 'var(--color-gray-700)',
    fontFamily: 'inherit',
  },
  clearBtn: {
    position: 'absolute', right: 8, background: 'none', border: 'none',
    cursor: 'pointer', color: 'var(--color-gray-400)', padding: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    background: 'var(--color-white)', border: '1px solid var(--color-gray-200)',
    borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    maxHeight: 400, overflowY: 'auto', zIndex: 100,
  },
  groupHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px 4px', fontSize: 11, fontWeight: 600,
    color: 'var(--color-gray-500)', textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  groupLabel: { flex: 1 },
  groupCount: {
    background: 'var(--color-gray-100)', borderRadius: 10,
    padding: '1px 7px', fontSize: 10, fontWeight: 600,
  },
  resultItem: {
    display: 'block', width: '100%', padding: '8px 14px',
    background: 'none', border: 'none', textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
    transition: 'background 0.1s',
  },
  resultContent: { display: 'flex', flexDirection: 'column', gap: 2 },
  resultTitle: { fontSize: 13, fontWeight: 500, color: 'var(--color-gray-800)' },
  resultSubtitle: { fontSize: 12, color: 'var(--color-gray-500)' },
  noResults: { padding: '16px 14px', textAlign: 'center', color: 'var(--color-gray-400)', fontSize: 13 },
}
