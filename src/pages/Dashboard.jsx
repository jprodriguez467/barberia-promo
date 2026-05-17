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
const monthISO = todayISO.slice(0,7)

function getClickedCircle(canvas, e) {
  const rect=canvas.getBoundingClientRect()
  const scaleX=780/rect.width, scaleY=430/rect.height
  const x=(e.clientX-rect.left)*scaleX, y=(e.clientY-rect.top)*scaleY
  const xs=[78,234,390,546,702], rowY=[163,298], R=55
  for(let i=0;i<10;i++){
    if(i===4||i===9) continue
    const cx=xs[i%5], cy=rowY[Math.floor(i/5)]
    if(Math.sqrt((x-cx)**2+(y-cy)**2)<=R) return i
  }
  return -1
}

function drawLoyaltyCard(canvas, client) {
  const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height
  const sellos=client.sellos?.length?[...client.sellos].sort():[client.fechaCorte]
  const precio=client.servicio==='pelo_barba'?'$17.000':'$12.000'
  const servNombre=client.servicio==='pelo_barba'?'Pelo y barba':'Corte de pelo'
  ctx.fillStyle='#111'; ctx.fillRect(0,0,W,H)
  ctx.save(); ctx.strokeStyle='rgba(200,70,0,0.22)'; ctx.lineWidth=28
  for(let x=-H;x<W+H;x+=70){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+H,H);ctx.stroke()}
  ctx.restore()
  ctx.fillStyle='#fff'; ctx.font='bold 25px Arial'; ctx.textAlign='center'
  ctx.fillText('Llenà esta tarjeta y GANA un corte GRATIS',W/2,40)
  ctx.fillStyle='#bbb'; ctx.font='13px Arial'
  ctx.fillText('Regresá dentro de los 15 días de tu último corte para sellar.',W/2,62)
  ctx.fillStyle='#FF6B00'; ctx.font='bold 16px Arial'
  ctx.fillText(`${client.nombre} ${client.apellido}`.toUpperCase(),W/2,86)
  const R=50, rowY=[163,298], xs=[78,234,390,546,702]
  for(let i=0;i<10;i++){
    const cx=xs[i%5], cy=rowY[Math.floor(i/5)]
    const stamped=i<sellos.length, is5=i===4, is10=i===9
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2)
    ctx.fillStyle=is5?'#5a0000':is10?'#003300':stamped?'#2a2a2a':'#1a1a1a'; ctx.fill()
    if(stamped&&!is5&&!is10){
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI,0)
      ctx.fillStyle='rgba(90,90,90,0.5)'; ctx.fill(); ctx.restore()
    }
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2)
    ctx.strokeStyle=stamped?'#FF6B00':'#444'; ctx.lineWidth=2.5; ctx.stroke()
    if(!stamped&&!is5&&!is10){
      ctx.beginPath(); ctx.arc(cx,cy,R-4,0,Math.PI*2)
      ctx.strokeStyle='rgba(255,107,0,0.15)'; ctx.lineWidth=1.5
      ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([])
    }
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
        ctx.fillStyle='#aaa'; ctx.font='10px Arial'; ctx.fillText('volvé antes',cx,cy+2)
        ctx.fillStyle='#FF6B00'; ctx.font='bold 13px Arial'; ctx.fillText(selloExpiry(sellos[i]),cx,cy+16)
      } else {
        ctx.fillStyle='rgba(255,107,0,0.3)'; ctx.font='10px Arial'
        ctx.fillText('tocá para',cx,cy+2); ctx.fillText('editar',cx,cy+14)
      }
    }
  }
  ctx.fillStyle='#fff'; ctx.font='bold 24px Arial'
  ctx.textAlign='left'; ctx.fillText(precio,22,H-14)
  ctx.textAlign='center'; ctx.fillText(servNombre,W/2,H-14)
}

function fmt(n) { return '$'+Number(n).toLocaleString('es-AR') }

export default function Dashboard() {
  const [clients,setClients]     = useState([])
  const [ventas,setVentas]       = useState([])
  const [loading,setLoading]     = useState(true)
  const [view,setView]           = useState('clientes')
  const [filter,setFilter]       = useState('todos')
  const [search,setSearch]       = useState('')
  const [showForm,setShowForm]   = useState(false)
  const [deleting,setDeleting]   = useState(null)
  const [saving,setSaving]       = useState(false)
  const [cardId,setCardId]       = useState(null)
  const [editing,setEditing]     = useState(null)
  const [editForm,setEditForm]   = useState({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
  const [form,setForm]           = useState({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
  const [selloEdit,setSelloEdit] = useState(null)
  const [ventaForm,setVentaForm] = useState({descripcion:'',monto:''})
  const [deletingVenta,setDeletingVenta] = useState(null)
  const [showHoyModal,setShowHoyModal]   = useState(false)
  const [removingHoy,setRemovingHoy]     = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const q=query(collection(db,'clientes'),orderBy('createdAt','desc'))
    return onSnapshot(q, snap => {
      setClients(snap.docs.map(d=>({id:d.id,...d.data()})))
      setLoading(false)
    })
  },[])

  useEffect(() => {
    const q=query(collection(db,'ventas'),orderBy('createdAt','desc'))
    return onSnapshot(q, snap => setVentas(snap.docs.map(d=>({id:d.id,...d.data()}))))
  },[])

  const cardClient = cardId ? clients.find(c=>c.id===cardId) : null
  useEffect(() => {
    if(cardClient && canvasRef.current) drawLoyaltyCard(canvasRef.current, cardClient)
  },[cardClient, selloEdit])

  // ── Estadísticas ──────────────────────────────
  const precioServicio = c => c.servicio==='pelo_barba' ? 17000 : 12000
  const sellosHoy = clients.flatMap(c =>
    (c.sellos||[c.fechaCorte]).filter(s=>s===todayISO).map(()=>precioServicio(c))
  )
  const sellosMes = clients.flatMap(c =>
    (c.sellos||[c.fechaCorte]).filter(s=>s.startsWith(monthISO)).map(()=>precioServicio(c))
  )
  const recServHoy = sellosHoy.reduce((a,b)=>a+b,0)
  const recServMes = sellosMes.reduce((a,b)=>a+b,0)
  const ventasHoy  = ventas.filter(v=>v.fecha===todayISO)
  const ventasMes  = ventas.filter(v=>v.fecha?.startsWith(monthISO))
  const recProdHoy = ventasHoy.reduce((s,v)=>s+Number(v.monto),0)
  const recProdMes = ventasMes.reduce((s,v)=>s+Number(v.monto),0)

  // Clientes que tienen sello HOY (para el modal)
  const clientesHoy = clients.filter(c =>
    (c.sellos||[c.fechaCorte]).includes(todayISO)
  )

  // ── Filtros clientes ──────────────────────────
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
    .filter(c=>{
      if(!search.trim()) return true
      const q=search.toLowerCase()
      return c.nombre?.toLowerCase().includes(q)||c.apellido?.toLowerCase().includes(q)||c.telefono?.includes(q)
    })

  // ── Handlers ─────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if(!form.nombre.trim()||!form.apellido.trim()||!form.fechaCorte) return
    setSaving(true)
    try {
      await addDoc(collection(db,'clientes'),{
        nombre:form.nombre.trim(), apellido:form.apellido.trim(),
        telefono:form.telefono.trim(), fechaCorte:form.fechaCorte,
        sellos:[form.fechaCorte], servicio:form.servicio, createdAt:serverTimestamp(),
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
    const sel=c.sellos?.length?c.sellos:[c.fechaCorte]
    if(sel.length>=10){ alert('¡Tarjeta completa! 🏆'); return }
    try{ await updateDoc(doc(db,'clientes',c.id),{sellos:arrayUnion(todayISO),fechaCorte:todayISO}) }
    catch(err){ alert('Error: '+err.message) }
  }

  async function handleRemoveTodaySello(c) {
    const sellos = (c.sellos?.length ? c.sellos : [c.fechaCorte]).filter(s=>s!==todayISO)
    if(sellos.length===0){ alert('No se puede quitar el único sello.'); return }
    const newFecha = [...sellos].sort()[sellos.length-1]
    try{
      await updateDoc(doc(db,'clientes',c.id),{sellos,fechaCorte:newFecha})
      setRemovingHoy(null)
    } catch(err){ alert('Error: '+err.message) }
  }

  async function handleRemoveLastSello(clientId, sellos) {
    if(sellos.length<=1){ alert('No se puede borrar el único sello.'); return }
    const newSellos=[...sellos].sort().slice(0,-1)
    try{ await updateDoc(doc(db,'clientes',clientId),{sellos:newSellos,fechaCorte:newSellos[newSellos.length-1]}) }
    catch(err){ alert('Error: '+err.message) }
  }

  function openEdit(c) {
    setEditForm({nombre:c.nombre,apellido:c.apellido,telefono:c.telefono||'',fechaCorte:c.fechaCorte,servicio:c.servicio||'pelo'})
    setEditing(c.id)
  }

  async function handleEditSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      await updateDoc(doc(db,'clientes',editing),{
        nombre:editForm.nombre.trim(), apellido:editForm.apellido.trim(),
        telefono:editForm.telefono.trim(), fechaCorte:editForm.fechaCorte, servicio:editForm.servicio,
      })
      setEditing(null)
    } catch(err){ alert('Error: '+err.message) }
    finally{ setSaving(false) }
  }

  function handleCanvasClick(e) {
    if(!canvasRef.current||!cardClient) return
    const idx=getClickedCircle(canvasRef.current,e)
    if(idx===-1) return
    const sellos=cardClient.sellos?.length?[...cardClient.sellos].sort():[cardClient.fechaCorte]
    setSelloEdit({index:idx,date:sellos[idx]||todayISO})
  }

  async function handleSelloEditSave() {
    if(!selloEdit||!cardClient) return
    const sellos=cardClient.sellos?.length?[...cardClient.sellos].sort():[cardClient.fechaCorte]
    const newSellos=[...sellos]; newSellos[selloEdit.index]=selloEdit.date
    const sorted=[...newSellos].sort()
    try{ await updateDoc(doc(db,'clientes',cardClient.id),{sellos:sorted,fechaCorte:sorted[sorted.length-1]}); setSelloEdit(null) }
    catch(err){ alert('Error: '+err.message) }
  }

  async function handleSelloEditDelete() {
    if(!selloEdit||!cardClient) return
    const sellos=cardClient.sellos?.length?[...cardClient.sellos].sort():[cardClient.fechaCorte]
    if(sellos.length<=1){ alert('No se puede borrar el único sello.'); return }
    const newSellos=sellos.filter((_,i)=>i!==selloEdit.index)
    try{ await updateDoc(doc(db,'clientes',cardClient.id),{sellos:newSellos,fechaCorte:newSellos[newSellos.length-1]}); setSelloEdit(null) }
    catch(err){ alert('Error: '+err.message) }
  }

  async function handleSelloEditAdd() {
    if(!selloEdit||!cardClient) return
    const sellos=cardClient.sellos?.length?[...cardClient.sellos].sort():[cardClient.fechaCorte]
    if(sellos.length>=10){ alert('¡Tarjeta completa!'); return }
    const newSellos=[...sellos,selloEdit.date].sort()
    try{ await updateDoc(doc(db,'clientes',cardClient.id),{sellos:newSellos,fechaCorte:newSellos[newSellos.length-1]}); setSelloEdit(null) }
    catch(err){ alert('Error: '+err.message) }
  }

  async function handleAddVenta(e) {
    e.preventDefault(); setSaving(true)
    try {
      await addDoc(collection(db,'ventas'),{
        descripcion:ventaForm.descripcion.trim(), monto:Number(ventaForm.monto),
        fecha:todayISO, createdAt:serverTimestamp(),
      })
      setVentaForm({descripcion:'',monto:''})
    } catch(err){ alert('Error: '+err.message) }
    finally{ setSaving(false) }
  }

  async function handleDeleteVenta(id) {
    try{ await deleteDoc(doc(db,'ventas',id)) }
    catch(err){ alert('Error: '+err.message) }
    finally{ setDeletingVenta(null) }
  }

  function handleDownload() {
    if(!canvasRef.current||!cardClient) return
    const a=document.createElement('a')
    a.download=`tarjeta-${cardClient.nombre}-${cardClient.apellido}.png`
    a.href=canvasRef.current.toDataURL(); a.click()
  }

  const editingClient = editing ? clients.find(c=>c.id===editing) : null
  const todayLabel = new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})
  const mesLabel   = new Date().toLocaleDateString('es-AR',{month:'long',year:'numeric'})
  if(loading) return <div className={styles.loading}>Cargando...</div>

  return (
    <div className={styles.page}>

      {/* ── Modal clientes de hoy ── */}
      {showHoyModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <div style={{background:'#fff',borderRadius:'14px',padding:'24px',width:'100%',maxWidth:'480px',
            maxHeight:'80vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:'12px'}}>
            <h2 style={{margin:0,fontSize:'18px'}}>✂️ Clientes atendidos hoy</h2>
            <p style={{margin:0,fontSize:'13px',color:'#888'}}>
              {new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
            </p>
            {clientesHoy.length===0 && <p style={{color:'#aaa'}}>Ningún cliente registrado hoy.</p>}
            {clientesHoy.map(c=>{
              const isRemoving = removingHoy===c.id
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                  background:'#f9f9f9',border:'1px solid #eee',borderRadius:'10px',padding:'12px 14px'}}>
                  <div>
                    <p style={{margin:0,fontWeight:'bold',fontSize:'15px'}}>{c.nombre} {c.apellido}</p>
                    <p style={{margin:0,fontSize:'12px',color:'#888'}}>
                      {c.servicio==='pelo_barba'?'✂️🧔 Pelo y barba':'✂️ Corte de pelo'} · {fmt(c.servicio==='pelo_barba'?17000:12000)}
                    </p>
                  </div>
                  {isRemoving ? (
                    <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                      <span style={{fontSize:'12px',color:'#cc2222'}}>¿Quitar?</span>
                      <button className={styles.btnDanger} style={{padding:'4px 10px',fontSize:'12px'}}
                        onClick={()=>handleRemoveTodaySello(c)}>Sí</button>
                      <button className={styles.btnSecondary} style={{padding:'4px 10px',fontSize:'12px'}}
                        onClick={()=>setRemovingHoy(null)}>No</button>
                    </div>
                  ):(
                    <button onClick={()=>setRemovingHoy(c.id)}
                      style={{background:'#fff',border:'1px solid #ddd',borderRadius:'6px',padding:'6px 12px',
                        cursor:'pointer',fontSize:'12px',color:'#cc2222',fontWeight:'bold'}}>
                      ✕ No vino
                    </button>
                  )}
                </div>
              )
            })}
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'4px'}}>
              <button className={styles.btnSecondary} onClick={()=>{setShowHoyModal(false);setRemovingHoy(null)}}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tarjeta */}
      {cardClient && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:1000,
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <canvas ref={canvasRef} width={780} height={430} onClick={handleCanvasClick}
            style={{maxWidth:'100%',borderRadius:'12px',border:'2px solid #FF6B00',cursor:'pointer'}} />
          {selloEdit && (()=>{
            const sellos=cardClient.sellos?.length?[...cardClient.sellos].sort():[cardClient.fechaCorte]
            const isStamped=selloEdit.index<sellos.length
            return (
              <div style={{marginTop:'12px',background:'#1a1a1a',border:'1px solid #FF6B00',borderRadius:'10px',
                padding:'14px 20px',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap',justifyContent:'center'}}>
                <span style={{color:'#FF6B00',fontWeight:'bold',fontSize:'14px'}}>✏️ Sello #{selloEdit.index+1}</span>
                <input type="date" value={selloEdit.date} onChange={e=>setSelloEdit(s=>({...s,date:e.target.value}))}
                  style={{padding:'6px 10px',borderRadius:'6px',border:'1px solid #FF6B00',background:'#111',color:'#fff',fontSize:'14px'}} />
                {isStamped ? (
                  <>
                    <button onClick={handleSelloEditSave} style={{background:'#FF6B00',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',cursor:'pointer',fontWeight:'bold'}}>✅ Guardar</button>
                    <button onClick={handleSelloEditDelete} style={{background:'#cc2222',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',cursor:'pointer',fontWeight:'bold'}}>🗑 Borrar</button>
                  </>
                ):(
                  <button onClick={handleSelloEditAdd} style={{background:'#FF6B00',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',cursor:'pointer',fontWeight:'bold'}}>➕ Agregar</button>
                )}
                <button onClick={()=>setSelloEdit(null)} style={{background:'transparent',color:'#aaa',border:'1px solid #444',borderRadius:'6px',padding:'6px 12px',cursor:'pointer'}}>Cancelar</button>
              </div>
            )
          })()}
          <div style={{marginTop:'12px',display:'flex',gap:'10px'}}>
            <button className={styles.btnPrimary} onClick={handleDownload}>⬇️ Descargar</button>
            <button className={styles.btnSecondary} onClick={()=>{setCardId(null);setSelloEdit(null)}}>Cerrar</button>
          </div>
          <p style={{color:'#666',fontSize:'11px',marginTop:'8px'}}>Tocá cualquier círculo numerado para editar su fecha</p>
        </div>
      )}

      {/* Modal editar cliente */}
      {editing && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <form onSubmit={handleEditSave}
            style={{background:'#fff',borderRadius:'12px',padding:'24px',width:'100%',maxWidth:'480px',
              display:'flex',flexDirection:'column',gap:'12px',maxHeight:'90vh',overflowY:'auto'}}>
            <h2 style={{margin:0,fontSize:'18px'}}>✏️ Editar cliente</h2>
            <div className={styles.formGrid}>
              {[['Nombre','text',editForm.nombre,'nombre'],['Apellido','text',editForm.apellido,'apellido'],
                ['Teléfono','tel',editForm.telefono,'telefono']].map(([label,type,val,key])=>(
                <div key={key} className={styles.field}>
                  <label>{label}</label>
                  <input type={type} value={val} required={key!=='telefono'}
                    onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))} />
                </div>
              ))}
              <div className={styles.field}><label>Servicio</label>
                <select value={editForm.servicio} onChange={e=>setEditForm(f=>({...f,servicio:e.target.value}))}>
                  <option value="pelo">✂️ Corte de pelo — $12.000</option>
                  <option value="pelo_barba">✂️🧔 Pelo y barba — $17.000</option>
                </select>
              </div>
              <div className={styles.field}><label>Fecha último corte</label>
                <input type="date" value={editForm.fechaCorte} required onChange={e=>setEditForm(f=>({...f,fechaCorte:e.target.value}))} />
              </div>
            </div>
            {editingClient && (()=>{
              const sellos=editingClient.sellos?.length?[...editingClient.sellos].sort():[editingClient.fechaCorte]
              return (
                <div style={{borderTop:'1px solid #eee',paddingTop:'12px'}}>
                  <p style={{margin:'0 0 8px',fontWeight:'bold',fontSize:'14px'}}>🎫 Sellos ({sellos.length}/10)</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'10px'}}>
                    {sellos.map((s,i)=>(
                      <span key={i} style={{background:'#f0f0f0',borderRadius:'6px',padding:'3px 8px',fontSize:'12px'}}>{i+1}. {formatAR(s)}</span>
                    ))}
                  </div>
                  {sellos.length>1&&(
                    <button type="button" className={styles.btnDanger} style={{fontSize:'13px',padding:'6px 12px'}}
                      onClick={()=>handleRemoveLastSello(editing,sellos)}>
                      🗑 Borrar último sello ({formatAR(sellos[sellos.length-1])})
                    </button>
                  )}
                </div>
              )
            })()}
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button type="button" className={styles.btnSecondary} onClick={()=>setEditing(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>✂️ Promo Barbería</h1>
          <p className={styles.subtitle}>{todayLabel}</p>
        </div>
        {view==='clientes' && (
          <button className={styles.btnPrimary} onClick={()=>setShowForm(v=>!v)}>
            {showForm?'Cancelar':'+ Agregar cliente'}
          </button>
        )}
      </header>

      {/* Tabs */}
      <div style={{display:'flex',gap:'8px',padding:'0 16px 12px'}}>
        <button onClick={()=>setView('clientes')}
          style={{padding:'8px 18px',borderRadius:'20px',border:'none',cursor:'pointer',fontWeight:'bold',fontSize:'14px',
            background:view==='clientes'?'#111':'#eee',color:view==='clientes'?'#fff':'#555'}}>
          👥 Clientes
        </button>
        <button onClick={()=>setView('estadisticas')}
          style={{padding:'8px 18px',borderRadius:'20px',border:'none',cursor:'pointer',fontWeight:'bold',fontSize:'14px',
            background:view==='estadisticas'?'#111':'#eee',color:view==='estadisticas'?'#fff':'#555'}}>
          📊 Estadísticas
        </button>
      </div>

      {/* ── VISTA CLIENTES ── */}
      {view==='clientes' && <>
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
              <div className={styles.field}><label>Nombre</label>
                <input type="text" placeholder="Juan" value={form.nombre} required onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} /></div>
              <div className={styles.field}><label>Apellido</label>
                <input type="text" placeholder="García" value={form.apellido} required onChange={e=>setForm(f=>({...f,apellido:e.target.value}))} /></div>
              <div className={styles.field}><label>Teléfono (opcional)</label>
                <input type="tel" placeholder="342 555-0000" value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} /></div>
              <div className={styles.field}><label>Servicio</label>
                <select value={form.servicio} onChange={e=>setForm(f=>({...f,servicio:e.target.value}))}>
                  <option value="pelo">✂️ Corte de pelo — $12.000</option>
                  <option value="pelo_barba">✂️🧔 Pelo y barba — $17.000</option>
                </select></div>
              <div className={styles.field}><label>Fecha del último corte</label>
                <input type="date" value={form.fechaCorte} required onChange={e=>setForm(f=>({...f,fechaCorte:e.target.value}))} /></div>
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving?'Guardando...':'Guardar cliente'}</button>
            </div>
          </form>
        )}

        <div style={{padding:'0 16px 8px'}}>
          <input type="text" placeholder="🔍 Buscar por nombre, apellido o teléfono..." value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{width:'100%',padding:'10px 14px',borderRadius:'8px',border:'1px solid #ddd',fontSize:'14px',boxSizing:'border-box'}} />
        </div>

        <div className={styles.filters}>
          {[{key:'todos',label:`Todos (${clients.length})`},{key:'semana',label:`Esta semana (${semana})`},
            {key:'urgente',label:`Urgente (${urgente})`},{key:'activos',label:`Activos (${activos})`}].map(f=>(
            <button key={f.key} className={`${styles.filterBtn} ${filter===f.key?styles.filterActive:''}`}
              onClick={()=>setFilter(f.key)}>{f.label}</button>
          ))}
        </div>

        <div className={styles.list}>
          {filtered.length===0 && (
            <div className={styles.empty}>
              {search?`No se encontró "${search}".`:clients.length===0?'Todavía no hay clientes.':'No hay clientes en este filtro.'}
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
                    <button className={styles.btnPrimary} style={{padding:'4px 8px',fontSize:'13px'}} onClick={()=>handleAddSello(c)} title="Agregar corte de hoy">+✂️</button>
                    <button className={styles.btnSecondary} style={{padding:'4px 8px',fontSize:'13px'}} onClick={()=>setCardId(c.id)} title="Ver tarjeta">🎫</button>
                    <button className={styles.btnSecondary} style={{padding:'4px 8px',fontSize:'13px'}} onClick={()=>openEdit(c)} title="Editar">✏️</button>
                    <button className={styles.btnDelete} onClick={()=>setDeleting(c.id)} title="Eliminar">🗑</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>}

      {/* ── VISTA ESTADÍSTICAS ── */}
      {view==='estadisticas' && (
        <div style={{padding:'0 16px 32px'}}>

          <h2 style={{fontSize:'16px',fontWeight:'bold',margin:'0 0 10px'}}>
            📅 Hoy — {new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
          </h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'10px',marginBottom:'20px'}}>

            {/* Card clickeable clientes hoy */}
            <div onClick={()=>setShowHoyModal(true)}
              style={{background:'#fff8f0',borderRadius:'10px',padding:'14px',textAlign:'center',
                border:'2px solid #FF6B00',cursor:'pointer',transition:'transform 0.1s'}}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.03)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <div style={{fontSize:'22px',fontWeight:'bold',color:'#FF6B00'}}>{sellosHoy.length}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Clientes atendidos</div>
              <div style={{fontSize:'10px',color:'#FF6B00',marginTop:'4px'}}>👆 Ver quiénes son</div>
            </div>

            <div style={{background:'#f5f5f5',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #eee'}}>
              <div style={{fontSize:'20px',fontWeight:'bold',color:'#333'}}>{fmt(recServHoy)}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Servicios</div>
            </div>
            <div style={{background:'#f5f5f5',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #eee'}}>
              <div style={{fontSize:'20px',fontWeight:'bold',color:'#333'}}>{fmt(recProdHoy)}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Productos</div>
            </div>
            <div style={{background:'#e8f5e9',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #4caf50'}}>
              <div style={{fontSize:'22px',fontWeight:'bold',color:'#1a7a1a'}}>{fmt(recServHoy+recProdHoy)}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Total del día</div>
            </div>
          </div>

          <h2 style={{fontSize:'16px',fontWeight:'bold',margin:'0 0 10px'}}>
            📆 {(mesLabel.charAt(0).toUpperCase()+mesLabel.slice(1))}
          </h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'10px',marginBottom:'24px'}}>
            <div style={{background:'#f5f5f5',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #eee'}}>
              <div style={{fontSize:'22px',fontWeight:'bold',color:'#FF6B00'}}>{sellosMes.length}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Clientes atendidos</div>
            </div>
            <div style={{background:'#f5f5f5',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #eee'}}>
              <div style={{fontSize:'20px',fontWeight:'bold',color:'#333'}}>{fmt(recServMes)}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Servicios</div>
            </div>
            <div style={{background:'#f5f5f5',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #eee'}}>
              <div style={{fontSize:'20px',fontWeight:'bold',color:'#333'}}>{fmt(recProdMes)}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Productos</div>
            </div>
            <div style={{background:'#e8f5e9',borderRadius:'10px',padding:'14px',textAlign:'center',border:'1px solid #4caf50'}}>
              <div style={{fontSize:'22px',fontWeight:'bold',color:'#1a7a1a'}}>{fmt(recServMes+recProdMes)}</div>
              <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>Total del mes</div>
            </div>
          </div>

          <h2 style={{fontSize:'16px',fontWeight:'bold',margin:'0 0 10px'}}>🛍️ Registrar venta de producto</h2>
          <form onSubmit={handleAddVenta} style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'16px'}}>
            <input type="text" placeholder="Nombre del producto" value={ventaForm.descripcion}
              onChange={e=>setVentaForm(f=>({...f,descripcion:e.target.value}))} required
              style={{flex:'2',minWidth:'150px',padding:'10px 12px',borderRadius:'8px',border:'1px solid #ddd',fontSize:'14px'}} />
            <input type="number" placeholder="Precio $" value={ventaForm.monto}
              onChange={e=>setVentaForm(f=>({...f,monto:e.target.value}))} required min="1"
              style={{flex:'1',minWidth:'100px',padding:'10px 12px',borderRadius:'8px',border:'1px solid #ddd',fontSize:'14px'}} />
            <button type="submit" className={styles.btnPrimary} disabled={saving} style={{whiteSpace:'nowrap'}}>
              {saving?'...':'+ Agregar'}
            </button>
          </form>

          {ventasHoy.length>0 && <>
            <p style={{fontWeight:'bold',fontSize:'13px',color:'#555',margin:'0 0 8px'}}>Productos vendidos hoy:</p>
            {ventasHoy.map(v=>(
              <div key={v.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                background:'#fafafa',border:'1px solid #eee',borderRadius:'8px',padding:'10px 14px',marginBottom:'6px'}}>
                <span style={{fontSize:'14px'}}>{v.descripcion}</span>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <span style={{fontWeight:'bold',color:'#1a7a1a'}}>{fmt(v.monto)}</span>
                  {deletingVenta===v.id ? (
                    <>
                      <button className={styles.btnDanger} style={{padding:'3px 8px',fontSize:'12px'}} onClick={()=>handleDeleteVenta(v.id)}>Sí</button>
                      <button className={styles.btnSecondary} style={{padding:'3px 8px',fontSize:'12px'}} onClick={()=>setDeletingVenta(null)}>No</button>
                    </>
                  ):(
                    <button className={styles.btnDelete} style={{padding:'3px 8px',fontSize:'12px'}} onClick={()=>setDeletingVenta(v.id)}>🗑</button>
                  )}
                </div>
              </div>
            ))}
          </>}
          {ventasHoy.length===0 && <p style={{color:'#aaa',fontSize:'13px'}}>No hay productos registrados hoy.</p>}
        </div>
      )}
    </div>
  )
}