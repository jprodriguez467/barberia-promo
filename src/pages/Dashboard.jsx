import { useState, useEffect } from 'react'
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'
import styles from './Dashboard.module.css'

// ── helpers ────────────────────────────────────────────────
const TODAY = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function formatAR(str) {
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function daysLeft(fechaCorte) {
  const expiry = new Date(parseDate(fechaCorte).getTime() + 15 * 86400000)
  return Math.round((expiry - TODAY()) / 86400000)
}

function getStatus(days) {
  if (days < 0)  return { label: 'Expiró',    cls: 'gray' }
  if (days === 0) return { label: '¡Hoy!',    cls: 'red'   }
  if (days <= 3)  return { label: `${days}d`, cls: 'red'   }
  if (days <= 7)  return { label: `${days}d`, cls: 'amber' }
  return            { label: `${days}d`,       cls: 'green' }
}

function initials(nombre, apellido) {
  return `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase()
}

const todayISO = new Date().toISOString().split('T')[0]

// ── component ──────────────────────────────────────────────
export default function Dashboard() {
  const [clients, setClients]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('todos')
  const [showForm, setShowForm]     = useState(false)
  const [deleting, setDeleting]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({
    nombre: '', apellido: '', telefono: '', fechaCorte: todayISO,
  })

  // realtime listener
  useEffect(() => {
    const q = query(collection(db, 'clientes'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  // stats
  const urgente = clients.filter(c => { const d = daysLeft(c.fechaCorte); return d >= 0 && d <= 3 }).length
  const semana  = clients.filter(c => { const d = daysLeft(c.fechaCorte); return d >= 0 && d <= 7 }).length
  const activos = clients.filter(c => daysLeft(c.fechaCorte) >= 0).length

  // filtered + sorted
  const filtered = [...clients]
    .sort((a, b) => daysLeft(a.fechaCorte) - daysLeft(b.fechaCorte))
    .filter(c => {
      const d = daysLeft(c.fechaCorte)
      if (filter === 'semana')  return d >= 0 && d <= 7
      if (filter === 'urgente') return d >= 0 && d <= 3
      if (filter === 'activos') return d >= 0
      return true
    })

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.apellido.trim() || !form.fechaCorte) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'clientes'), {
        nombre:     form.nombre.trim(),
        apellido:   form.apellido.trim(),
        telefono:   form.telefono.trim(),
        fechaCorte: form.fechaCorte,
        createdAt:  serverTimestamp(),
      })
      setForm({ nombre: '', apellido: '', telefono: '', fechaCorte: todayISO })
      setShowForm(false)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDoc(doc(db, 'clientes', id))
    } catch (err) {
      alert('Error al eliminar: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  const todayLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (loading) return (
    <div className={styles.loading}>Cargando...</div>
  )

  return (
    <div className={styles.page}>
      {/* header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>✂️ Promo Barbería</h1>
          <p className={styles.subtitle}>{todayLabel}</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancelar' : '+ Agregar cliente'}
        </button>
      </header>

      {/* stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum} style={{ color: 'var(--red)' }}>{urgente}</span>
          <span className={styles.statLabel}>Urgente (≤ 3 días)</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum} style={{ color: 'var(--amber)' }}>{semana}</span>
          <span className={styles.statLabel}>Esta semana</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{clients.length}</span>
          <span className={styles.statLabel}>Total clientes</span>
        </div>
      </div>

      {/* form */}
      {showForm && (
        <form className={styles.form} onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Nombre</label>
              <input
                type="text" placeholder="Juan" value={form.nombre} required
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label>Apellido</label>
              <input
                type="text" placeholder="García" value={form.apellido} required
                onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label>Teléfono (opcional)</label>
              <input
                type="tel" placeholder="342 555-0000" value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label>Fecha del último corte</label>
              <input
                type="date" value={form.fechaCorte} required
                onChange={e => setForm(f => ({ ...f, fechaCorte: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      )}

      {/* filters */}
      <div className={styles.filters}>
        {[
          { key: 'todos',   label: `Todos (${clients.length})` },
          { key: 'semana',  label: `Esta semana (${semana})` },
          { key: 'urgente', label: `Urgente (${urgente})` },
          { key: 'activos', label: `Activos (${activos})` },
        ].map(f => (
          <button
            key={f.key}
            className={`${styles.filterBtn} ${filter === f.key ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* client list */}
      <div className={styles.list}>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {clients.length === 0
              ? 'Todavía no hay clientes. Agregá el primero.'
              : 'No hay clientes en este filtro.'}
          </div>
        )}

        {filtered.map(c => {
          const days = daysLeft(c.fechaCorte)
          const { label, cls } = getStatus(days)
          const expiry = new Date(parseDate(c.fechaCorte).getTime() + 15 * 86400000)
          const expiryStr = expiry.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
          const isConfirm = deleting === c.id

          return (
            <div
              key={c.id}
              className={`${styles.card} ${styles[`card_${cls}`]}`}
            >
              <div className={styles.avatar}>{initials(c.nombre, c.apellido)}</div>

              <div className={styles.info}>
                <p className={styles.name}>{c.nombre} {c.apellido}</p>
                <p className={styles.meta}>
                  {c.telefono && <span>📞 {c.telefono} &nbsp;</span>}
                  <span>✂️ {formatAR(c.fechaCorte)}</span>
                  <span className={styles.expiry}> · vence {expiryStr}</span>
                </p>
              </div>

              <span className={`${styles.badge} ${styles[`badge_${cls}`]}`}>{label}</span>

              {isConfirm ? (
                <div className={styles.confirm}>
                  <span>¿Borrar?</span>
                  <button className={styles.btnDanger} onClick={() => handleDelete(c.id)}>Sí</button>
                  <button className={styles.btnSecondary} onClick={() => setDeleting(null)}>No</button>
                </div>
              ) : (
                <button className={styles.btnDelete} onClick={() => setDeleting(c.id)} title="Eliminar">🗑</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
