import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, updateDoc, arrayUnion
} from 'firebase/firestore'
import { db } from '../firebase'
import styles from './Dashboard.module.css'

const TODAY = () => { const d=new Date(); d.setHours(0,0,0,0); return d }
function parseDate(str) {
  const [y,m,d]=str.split('-').map(Number); const dt=new Date(y,m-1,d); dt.setHours(0,0,0,0); return dt
}
function formatAR(str) { const [y,m,d]=str.split('-'); return `${d}/${m}/${y}` }
function selloExpiry(str) {
  if(!str) return ''
  const [y,m,d]=str.split('-').map(Number)
  const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+15)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`
}
function daysLeft(fechaCorte) {
  const expiry=new Date(parseDate(fechaCorte).getTime()+15*86400000)
  return Math.round((expiry-TODAY())/86400000)
}
function getStatus(days) {
  if(days<0)   return {label:'Expiró',   cls:'gray'}
  if(days===0) return {label:'¡Hoy!',    cls:'red'}
  if(days<=3)  return {label:`${days}d`, cls:'red'}
  if(days<=7)  return {label:`${days}d`, cls:'amber'}
  return              {label:`${days}d`, cls:'green'}
}
function initials(n,a) { return `${n?.[0]??''}${a?.[0]??''}`.toUpperCase() }
const todayISO = new Date().toISOString().split('T')[0]

function drawLoyaltyCard(canvas, client) {
  const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height
  const sellos = client.sellos?.length ? [...client.sellos].sort() : [client.fechaCorte]
  const precio = client.servicio==='pelo_barba' ? '$17.000' : '$12.000'
  const servNombre = client.servicio==='pelo_barba' ? 'Pelo y barba' : 'Corte de pelo'

  ctx.fillStyle='#111'; ctx.fillRect(0,0,W,H)
  ctx.save(); ctx.strokeStyle='rgba(200,70,0,0.22)'; ctx.lineWidth=28
  for(let x=-H; x<W+H; x+=70){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke() }
  ctx.restore()

  ctx.fillStyle='#fff'; ctx.font='bold 25px Arial'; ctx.textAlign='center'
  ctx.fillText('Llenà esta tarjeta y GANA un corte GRATIS', W/2, 40)
  ctx.fillStyle='#bbb'; ctx.font='13px Arial'
  ctx.fillText('Regresá dentro de los 15 días de tu último corte para sellar.', W/2, 62)
  ctx.fillStyle='#FF6B00'; ctx.font='bold 16px Arial'
  ctx.fillText(`${client.nombre} ${client.apellido}`.toUpperCase(), W/2, 86)

  const R=50, rowY=[163,298], xs=[78,234,390,546,702]
  for(let i=0; i<10; i++){
    const cx=xs[i%5], cy=rowY[Math.floor(i/5)]
    const stamped=i<sellos.length, is5=i===4, is10=i===9
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2)
    ctx.fillStyle = is5?'#5a0000': is10?'#003300': stamped?'#2a2a2a':'#1a1a1a'
    ctx.fill()
    if(stamped&&!is5&&!is10){
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI,0)
      ctx.fillStyle='rgba(90,90,90,0.5)'; ctx.fill(); ctx.restore()
    }
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2)
    ctx.strokeStyle=stamped?'#FF6B00':'#444'; ctx.lineWidth=2.5; ctx.stroke()
    ctx.textAlign='center'
    if(is5){
      ctx.fillStyle='#FF4444'; ctx.font='bold 20px Arial'; ctx.fillText('50%',cx,cy-4)
      ctx.font='bold 14px Arial'; ctx.fillText('OFF',cx,cy+17)
    } else if(is10){
      ctx.fillStyle='#66DD66'; ctx.font='bold 14px Arial'
      ctx.fillText('Corte',cx,cy-4); ctx.fillText('gratis',cx,cy+15)
    } else {
      ctx.fillStyle='#aaa'; ctx.font='bold 13px Arial'
      ctx.fillText(String(i+1).padStart(2,'0'),cx,cy-14)
      if(stamped){
        ctx.fillStyle='#aaa'; ctx.font='10px Arial'
        ctx.fillText('volvé antes',cx,cy+2)
        ctx.fillStyle='#FF6B00'; ctx.font='bold 13px Arial'
        ctx.fillText(selloExpiry(sellos[i]),cx,cy+16)
      }
    }
  }
  ctx.fillStyle='#fff'; ctx.font='bold 24px Arial'
  ctx.textAlign='left'; ctx.fillText(precio,22,H-14)
  ctx.textAlign='center'; ctx.fillText(servNombre,W/2,H-14)
}

export default function Dashboard() {
  const [clients,setClients]   = useState([])
  const [loading,setLoading]   = useState(true)
  const [filter,setFilter]     = useState('todos')
  const [showForm,setShowForm] = useState(false)
  const [deleting,setDeleting] = useState(null)
  const [saving,setSaving]     = useState(false)
  const [cardId,setCardId]     = useState(null)
  const [editing,setEditing]   = useState(null)
  const [editForm,setEditForm] = useState({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
  const [form,setForm] = useState({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
  const canvasRef = useRef(null)

  useEffect(() => {
    const q=query(collection(db,'clientes'),orderBy('createdAt','desc'))
    return onSnapshot(q, snap => {
      setClients(snap.docs.map(d=>({id:d.id,...d.data()})))
      setLoading(false)
    })
  },[])

  const cardClient = cardId ? clients.find(c=>c.id===cardId) : null
  useEffect(() => {
    if(cardClient && canvasRef.current) drawLoyaltyCard(canvasRef.current, cardClient)
  },[cardClient])

  const urgente = clients.filter(c=>{const d=daysLeft(c.fechaCorte);return d>=0&&d<=3}).length
  const semana  = clients.filter(c=>{const d=daysLeft(c.fechaCorte);return d>=0&&d<=7}).length
  const activos = clients.filter(c=>daysLeft(c.fechaCorte)>=0).length

  const filtered = [...clients]
    .sort((a,b)=>daysLeft(a.fechaCorte)-daysLeft(b.fechaCorte))
    .filter(c=>{
      const d=daysLeft(c.fechaCorte)
      if(filter==='semana')  return d>=0&&d<=7
      if(filter==='urgente') return d>=0&&d<=3
      if(filter==='activos') return d>=0
      return true
    })

  async function handleAdd(e) {
    e.preventDefault()
    if(!form.nombre.trim()||!form.apellido.trim()||!form.fechaCorte) return
    setSaving(true)
    try {
      await addDoc(collection(db,'clientes'),{
        nombre:form.nombre.trim(), apellido:form.apellido.trim(),
        telefono:form.telefono.trim(), fechaCorte:form.fechaCorte,
        sellos:[form.fechaCorte], servicio:form.servicio,
        createdAt:serverTimestamp(),
      })
      setForm({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
      setShowForm(false)
    } catch(err){ alert('Error: '+err.message) }
    finally{ setSaving(false) }
  }

  async function handleDelete(id) {
    try{ await deleteDoc(doc(db,'clientes',id)) }
    catch(err){ alert('Error: '+err.message) }
    finally{ setDeleting(null) }
  }

  async function handleAddSello(c) {
    const sel = c.sellos?.length ? c.sellos : [c.fechaCorte]
    if(sel.length>=10){ alert('¡Tarjeta completa! El cliente ganó un corte gratis 🏆'); return }
    try{
      await updateDoc(doc(db,'clientes',c.id),{ sellos:arrayUnion(todayISO), fechaCorte:todayISO })
    } catch(err){ alert('Error: '+err.message) }
  }

  async function handleRemoveLastSello(clientId, sellos) {
    if(sellos.length<=1){ alert('No se puede borrar el único sello.'); return }
    const newSellos = [...sellos].sort().slice(0,-1)
    const newFecha = newSellos[newSellos.length-1]
    try{
      await updateDoc(doc(db,'clientes',clientId),{ sellos:newSellos, fechaCorte:newFecha })
    } catch(err){ alert('Error: '+err.message) }
  }

  function openEdit(c) {
    setEditForm({
      nombre:c.nombre, apellido:c.apellido,
      telefono:c.telefono||'', fechaCorte:c.fechaCorte,
      servicio:c.servicio||'pelo'
    })
    setEditing(c.id)
  }

  async function handleEditSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateDoc(doc(db,'clientes',editing),{
        nombre:editForm.nombre.trim(),
        apellido:editForm.apellido.trim(),
        telefono:editForm.telefono.trim(),
        fechaCorte:editForm.fechaCorte,
        servicio:editForm.servicio,
      })
      setEditing(null)
    } catch(err){ alert('Error: '+err.message) }
    finally{ setSaving(false) }
  }

  function handleDownload() {
    if(!canvasRef.current||!cardClient) return
    const a=document.createElement('a')
    a.download=`tarjeta-${cardClient.nombre}-${cardClient.apellido}.png`
    a.href=canvasRef.current.toDataURL(); a.click()
  }

  const editingClient = editing ? clients.find(c=>c.id===editing) : null
  const todayLabel = new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})
  if(loading) return <div className={styles.loading}>Cargando...</div>

  return (
    <div className={styles.page}>

      {cardClient && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:1000,
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <canvas ref={canvasRef} width={780} height={430}
            style={{maxWidth:'100%',borderRadius:'12px',border:'2px solid #FF6B00'}} />
          <div style={{marginTop:'14px',display:'flex',gap:'10px'}}>
            <button className={styles.btnPrimary} onClick={handleDownload}>⬇️ Descargar</button>
            <button className={styles.btnSecondary} onClick={()=>setCardId(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {editing && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <form onSubmit={handleEditSave}
            style={{background:'#fff',borderRadius:'12px',padding:'24px',width:'100%',maxWidth:'480px',display:'flex',flexDirection:'column',gap:'12px'}}>
            <h2 style={{margin:0,fontSize:'18px'}}>✏️ Editar cliente</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Nombre</label>
                <input type="text" value={editForm.nombre} required
                  onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))} />
              </div>
              <div className={styles.field}>
                <label>Apellido</label>
                <input type="text" value={editForm.apellido} required
                  onChange={e=>setEditForm(f=>({...f,apellido:e.target.value}))} />
              </div>
              <div className={styles.field}>
                <label>Teléfono</label>
                <input type="tel" value={editForm.telefono}
                  onChange={e=>setEditForm(f=>({...f,telefono:e.target.value}))} />
              </div>
              <div className={styles.field}>
                <label>Servicio</label>
                <select value={editForm.servicio} onChange={e=>setEditForm(f=>({...f,servicio:e.target.value}))}>
                  <option value="pelo">✂️ Corte de pelo — $12.000</option>
                  <option value="pelo_barba">✂️🧔 Pelo y barba — $17.000</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Fecha último corte</label>
                <input type="date" value={editForm.fechaCorte} required
                  onChange={e=>setEditForm(f=>({...f,fechaCorte:e.target.value}))} />
              </div>
            </div>

            {editingClient && (()=>{
              const sellos = editingClient.sellos?.length ? [...editingClient.sellos].sort() : [editingClient.fechaCorte]
              return (
                <div style={{borderTop:'1px solid #eee',paddingTop:'12px'}}>
                  <p style={{margin:'0 0 8px',fontWeight:'bold',fontSize:'14px'}}>🎫 Sellos ({sellos.length}/10)</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'10px'}}>
                    {sellos.map((s,i)=>(
                      <span key={i} style={{background:'#f0f0f0',borderRadius:'6px',padding:'3px 8px',fontSize:'12px'}}>
                        {i+1}. {formatAR(s)}
                      </span>
                    ))}
                  </div>
                  {sellos.length>1 && (
                    <button type="button" className={styles.btnDanger}
                      style={{fontSize:'13px',padding:'6px 12px'}}
                      onClick={()=>handleRemoveLastSello(editing, sellos)}>
                      🗑 Borrar último sello ({formatAR(sellos[sellos.length-1])})
                    </button>
                  )}
                </div>
              )
            })()}

            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button type="button" className={styles.btnSecondary} onClick={()=>setEditing(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving?'Guardando...':'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>✂️ Promo Barbería</h1>
          <p className={styles.subtitle}>{todayLabel}</p>
        </div>
        <button className={styles.btnPrimary} onClick={()=>setShowForm(v=>!v)}>
          {showForm?'Cancelar':'+ Agregar cliente'}
        </button>
      </header>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum} style={{color:'var(--red)'}}>{urgente}</span>
          <span className={styles.statLabel}>Urgente (≤ 3 días)</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum} style={{color:'var(--amber)'}}>{semana}</span>
          <span className={styles.statLabel}>Esta semana</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{clients.length}</span>
          <span className={styles.statLabel}>Total clientes</span>
        </div>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Nombre</label>
              <input type="text" placeholder="Juan" value={form.nombre} required
                onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} />
            </div>
            <div className={styles.field}>
              <label>Apellido</label>
              <input type="text" placeholder="García" value={form.apellido} required
                onChange={e=>setForm(f=>({...f,apellido:e.target.value}))} />
            </div>
            <div className={styles.field}>
              <label>Teléfono (opcional)</label>
              <input type="tel" placeholder="342 555-0000" value={form.telefono}
                onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} />
            </div>
            <div className={styles.field}>
              <label>Servicio</label>
              <select value={form.servicio} onChange={e=>setForm(f=>({...f,servicio:e.target.value}))}>
                <option value="pelo">✂️ Corte de pelo — $12.000</option>
                <option value="pelo_barba">✂️🧔 Pelo y barba — $17.000</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Fecha del último corte</label>
              <input type="date" value={form.fechaCorte} required
                onChange={e=>setForm(f=>({...f,fechaCorte:e.target.value}))} />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving?'Guardando...':'Guardar cliente'}
            </button>
          </div>
        </form>
      )}

      <div className={styles.filters}>
        {[
          {key:'todos',   label:`Todos (${clients.length})`},
          {key:'semana',  label:`Esta semana (${semana})`},
          {key:'urgente', label:`Urgente (${urgente})`},
          {key:'activos', label:`Activos (${activos})`},
        ].map(f=>(
          <button key={f.key}
            className={`${styles.filterBtn} ${filter===f.key?styles.filterActive:''}`}
            onClick={()=>setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {filtered.length===0 && (
          <div className={styles.empty}>
            {clients.length===0?'Todavía no hay clientes. Agregá el primero.':'No hay clientes en este filtro.'}
          </div>
        )}
        {filtered.map(c=>{
          const days=daysLeft(c.fechaCorte), {label,cls}=getStatus(days)
          const expiry=new Date(parseDate(c.fechaCorte).getTime()+15*86400000)
          const expiryStr=expiry.toLocaleDateString('es-AR',{day:'numeric',month:'short'})
          const isConfirm=deleting===c.id
          const sellos=c.sellos?.length?c.sellos:[c.fechaCorte]
          return (
            <div key={c.id} className={`${styles.card} ${styles[`card_${cls}`]}`}>
              <div className={styles.avatar}>{initials(c.nombre,c.apellido)}</div>
              <div className={styles.info}>
                <p className={styles.name}>{c.nombre} {c.apellido}</p>
                <p className={styles.meta}>
                  {c.telefono&&<span>📞 {c.telefono}&nbsp;</span>}
                  <span>{c.servicio==='pelo_barba'?'✂️🧔':'✂️'} {formatAR(c.fechaCorte)}</span>
                  <span className={styles.expiry}> · vence {expiryStr}</span>
                </p>
                <p style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>
                  🎫 {sellos.length}/10
                  {sellos.length>=5&&sellos.length<10&&' · 🎉 50% OFF desbloqueado'}
                  {sellos.length>=10&&' · 🏆 ¡Corte gratis!'}
                </p>
              </div>
              <span className={`${styles.badge} ${styles[`badge_${cls}`]}`}>{label}</span>
              {isConfirm?(
                <div className={styles.confirm}>
                  <span>¿Borrar?</span>
                  <button className={styles.btnDanger} onClick={()=>handleDelete(c.id)}>Sí</button>
                  <button className={styles.btnSecondary} onClick={()=>setDeleting(null)}>No</button>
                </div>
              ):(
                <div style={{display:'flex',gap:'4px'}}>
                  <button className={styles.btnPrimary} style={{padding:'4px 8px',fontSize:'13px'}}
                    onClick={()=>handleAddSello(c)} title="Agregar corte de hoy">+✂️</button>
                  <button className={styles.btnSecondary} style={{padding:'4px 8px',fontSize:'13px'}}
                    onClick={()=>setCardId(c.id)} title="Ver tarjeta">🎫</button>
                  <button className={styles.btnSecondary} style={{padding:'4px 8px',fontSize:'13px'}}
                    onClick={()=>openEdit(c)} title="Editar">✏️</button>
                  <button className={styles.btnDelete} onClick={()=>setDeleting(c.id)} title="Eliminar">🗑</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}