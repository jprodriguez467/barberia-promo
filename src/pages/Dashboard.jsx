import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, updateDoc, arrayUnion, where
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts'
import styles from './Dashboard.module.css'

const TODAY = () => { const d=new Date(); d.setHours(0,0,0,0); return d }
function parseDate(str) {
  const [y,m,d]=str.split('-').map(Number); const dt=new Date(y,m-1,d); dt.setHours(0,0,0,0); return dt
}
function formatAR(str) { if(!str) return ''; const [y,m,d]=str.split('-'); return `${d}/${m}/${y}` }
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

function isoToLabel(iso) {
  const d = parseDate(iso)
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate()-1)
  if(d.getTime()===hoy.getTime()) return 'Hoy'
  if(d.getTime()===ayer.getTime()) return 'Ayer'
  return d.toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})
}

function addDays(iso, n) {
  const d = parseDate(iso); d.setDate(d.getDate()+n)
  return d.toISOString().split('T')[0]
}

function getMonthLabel(iso) {
  const [y,m]=iso.split('-')
  const names=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(m)-1]} ${y.slice(2)}`
}

function computeStats(clients) {
  const map = {}
  clients.forEach(c => {
    const sellos = c.sellos?.length ? [...c.sellos].sort() : [c.fechaCorte]
    const firstMonth = sellos[0].slice(0,7)
    const precio = c.servicio === 'pelo_barba' ? 17000 : 12000
    sellos.forEach(s => {
      const mo = s.slice(0,7)
      if(!map[mo]) map[mo] = {cortes:0, ingresos:0, nuevos:0, recurrentes:0, pelo:0, pelo_barba:0}
      map[mo].cortes++
      map[mo].ingresos += precio
      if(mo===firstMonth) map[mo].nuevos++
      else map[mo].recurrentes++
      if(c.servicio==='pelo_barba') map[mo].pelo_barba++
      else map[mo].pelo++
    })
  })
  const sorted = Object.keys(map).sort()
  const last6 = sorted.slice(-6)
  return last6.map(mo => ({ mo, label: getMonthLabel(mo), ...map[mo] }))
}

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

const COLORS_PIE = ['#FF6B00','#3b82f6']

function StatsPanel({ clients }) {
  const statsData = computeStats(clients)
  const currentMo = todayISO.slice(0,7)
  const curr = statsData.find(s=>s.mo===currentMo) || {cortes:0,ingresos:0,nuevos:0,recurrentes:0,pelo:0,pelo_barba:0}
  const totalPelo = clients.reduce((a,c)=>a+(c.servicio==='pelo_barba'?0:1),0)
  const totalPeloBarba = clients.reduce((a,c)=>a+(c.servicio==='pelo_barba'?1:0),0)
  const totalCortes = clients.reduce((a,c)=>a+(c.sellos?.length||1),0)
  const pieData = [
    {name:'Solo pelo', value: totalPelo || 0},
    {name:'Pelo+barba', value: totalPeloBarba || 0},
  ]
  const kpiStyle = {background:'#1a1a1a',borderRadius:'12px',padding:'16px 20px',display:'flex',flexDirection:'column',gap:'4px',flex:'1',minWidth:'140px'}
  const kpiNum = {fontSize:'28px',fontWeight:'bold',color:'#FF6B00',lineHeight:1}
  const kpiLabel = {fontSize:'12px',color:'#999'}
  return (
    <div style={{marginTop:'16px',display:'flex',flexDirection:'column',gap:'20px'}}>
      <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
        <div style={kpiStyle}><span style={kpiNum}>{curr.cortes}</span><span style={kpiLabel}>Cortes este mes</span></div>
        <div style={kpiStyle}><span style={{...kpiNum,color:'#22c55e'}}>${(curr.ingresos/1000).toFixed(0)}K</span><span style={kpiLabel}>Ingresos este mes</span></div>
        <div style={kpiStyle}><span style={{...kpiNum,color:'#3b82f6'}}>{totalCortes}</span><span style={kpiLabel}>Cortes totales</span></div>
        <div style={kpiStyle}><span style={{...kpiNum,color:'#a855f7'}}>{clients.length ? Math.round(totalPeloBarba/clients.length*100) : 0}%</span><span style={kpiLabel}>Clientes con barba</span></div>
      </div>
      <div style={{background:'#1a1a1a',borderRadius:'12px',padding:'16px'}}>
        <p style={{color:'#fff',fontWeight:'bold',marginBottom:'12px',fontSize:'14px'}}>✂️ Cortes por mes</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={statsData} margin={{top:4,right:8,left:-10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="label" tick={{fill:'#aaa',fontSize:11}} />
            <YAxis tick={{fill:'#aaa',fontSize:11}} allowDecimals={false} />
            <Tooltip contentStyle={{background:'#222',border:'1px solid #444',color:'#fff'}} />
            <Bar dataKey="cortes" fill="#FF6B00" radius={[4,4,0,0]} name="Cortes" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:'#1a1a1a',borderRadius:'12px',padding:'16px'}}>
        <p style={{color:'#fff',fontWeight:'bold',marginBottom:'12px',fontSize:'14px'}}>💰 Ingresos estimados por mes ($)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={statsData} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="label" tick={{fill:'#aaa',fontSize:11}} />
            <YAxis tick={{fill:'#aaa',fontSize:11}} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{background:'#222',border:'1px solid #444',color:'#fff'}} formatter={v=>[`$${v.toLocaleString('es-AR')}`,'Ingresos']} />
            <Line type="monotone" dataKey="ingresos" stroke="#22c55e" strokeWidth={2.5} dot={{fill:'#22c55e',r:4}} activeDot={{r:6}} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:'#1a1a1a',borderRadius:'12px',padding:'16px'}}>
        <p style={{color:'#fff',fontWeight:'bold',marginBottom:'12px',fontSize:'14px'}}>👤 Nuevos vs Recurrentes por mes</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={statsData} margin={{top:4,right:8,left:-10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="label" tick={{fill:'#aaa',fontSize:11}} />
            <YAxis tick={{fill:'#aaa',fontSize:11}} allowDecimals={false} />
            <Tooltip contentStyle={{background:'#222',border:'1px solid #444',color:'#fff'}} />
            <Legend wrapperStyle={{color:'#ccc',fontSize:12}} />
            <Bar dataKey="nuevos" stackId="a" fill="#3b82f6" name="Nuevos" />
            <Bar dataKey="recurrentes" stackId="a" fill="#FF6B00" radius={[4,4,0,0]} name="Recurrentes" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:'#1a1a1a',borderRadius:'12px',padding:'16px',display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'160px'}}>
          <p style={{color:'#fff',fontWeight:'bold',marginBottom:'4px',fontSize:'14px'}}>💈 Tipo de servicio</p>
          <p style={{color:'#999',fontSize:'12px',marginBottom:'12px'}}>Del total de clientes</p>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{width:12,height:12,borderRadius:3,background:'#FF6B00'}}/>
              <span style={{color:'#ccc',fontSize:'13px'}}>Solo pelo: <strong style={{color:'#FF6B00'}}>{totalPelo}</strong></span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{width:12,height:12,borderRadius:3,background:'#3b82f6'}}/>
              <span style={{color:'#ccc',fontSize:'13px'}}>Pelo + barba: <strong style={{color:'#3b82f6'}}>{totalPeloBarba}</strong></span>
            </div>
          </div>
        </div>
        <PieChart width={140} height={140}>
          <Pie data={pieData} cx={65} cy={65} innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3}>
            {pieData.map((_,i)=><Cell key={i} fill={COLORS_PIE[i]} />)}
          </Pie>
          <Tooltip contentStyle={{background:'#222',border:'1px solid #444',color:'#fff'}} />
        </PieChart>
      </div>
    </div>
  )
}

function DayPanel({ clients, ventas, onAddVenta, onDeleteVenta }) {
  const [selectedDay, setSelectedDay] = useState(todayISO)
  const [descForm, setDescForm] = useState('')
  const [montoForm, setMontoForm] = useState('')
  const [savingV, setSavingV] = useState(false)

  const cortesDelDia = clients.filter(c =>
    c.sellos?.includes(selectedDay) || (!c.sellos?.length && c.fechaCorte === selectedDay)
  )
  const ventasDelDia = ventas.filter(v => v.fecha === selectedDay)

  const totalCortes = cortesDelDia.reduce((a,c) => a + (c.servicio==='pelo_barba' ? 17000 : 12000), 0)
  const totalVentas = ventasDelDia.reduce((a,v) => a + (v.monto||0), 0)
  const totalDia = totalCortes + totalVentas

  async function handleAddVenta(e) {
    e.preventDefault()
    if(!descForm.trim() || !montoForm) return
    setSavingV(true)
    await onAddVenta({ fecha: selectedDay, descripcion: descForm.trim(), monto: parseInt(montoForm) })
    setDescForm(''); setMontoForm('')
    setSavingV(false)
  }

  const box = { background:'#1a1a1a', borderRadius:'12px', padding:'16px', marginBottom:'0' }

  return (
    <div style={{marginTop:'16px', display:'flex', flexDirection:'column', gap:'16px'}}>

      {/* Navegación de día */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#1a1a1a', borderRadius:'12px', padding:'12px 16px'}}>
        <button onClick={()=>setSelectedDay(d=>addDays(d,-1))}
          style={{background:'#333',border:'none',color:'#fff',borderRadius:'8px',padding:'6px 14px',cursor:'pointer',fontSize:'18px'}}>←</button>
        <div style={{textAlign:'center'}}>
          <p style={{color:'#FF6B00',fontWeight:'bold',fontSize:'18px',margin:0}}>{isoToLabel(selectedDay)}</p>
          <p style={{color:'#888',fontSize:'12px',margin:0}}>{formatAR(selectedDay)}</p>
        </div>
        <button onClick={()=>setSelectedDay(d=>addDays(d,1))} disabled={selectedDay>=todayISO}
          style={{background: selectedDay>=todayISO ?'#222':'#333',border:'none',color: selectedDay>=todayISO ?'#555':'#fff',borderRadius:'8px',padding:'6px 14px',cursor: selectedDay>=todayISO ?'default':'pointer',fontSize:'18px'}}>→</button>
      </div>

      {/* Resumen del día */}
      <div style={{display:'flex', gap:'12px', flexWrap:'wrap'}}>
        <div style={{...box, flex:1, minWidth:'130px'}}>
          <p style={{color:'#FF6B00',fontWeight:'bold',fontSize:'22px',margin:'0 0 2px'}}>{cortesDelDia.length}</p>
          <p style={{color:'#999',fontSize:'12px',margin:0}}>Cortes</p>
          <p style={{color:'#FF6B00',fontSize:'13px',margin:'4px 0 0'}}>${totalCortes.toLocaleString('es-AR')}</p>
        </div>
        <div style={{...box, flex:1, minWidth:'130px'}}>
          <p style={{color:'#3b82f6',fontWeight:'bold',fontSize:'22px',margin:'0 0 2px'}}>{ventasDelDia.length}</p>
          <p style={{color:'#999',fontSize:'12px',margin:0}}>Productos</p>
          <p style={{color:'#3b82f6',fontSize:'13px',margin:'4px 0 0'}}>${totalVentas.toLocaleString('es-AR')}</p>
        </div>
        <div style={{...box, flex:1, minWidth:'130px', border:'1px solid #22c55e33'}}>
          <p style={{color:'#22c55e',fontWeight:'bold',fontSize:'22px',margin:'0 0 2px'}}>${(totalDia/1000).toFixed(0)}K</p>
          <p style={{color:'#999',fontSize:'12px',margin:0}}>Total del día</p>
          <p style={{color:'#22c55e',fontSize:'13px',margin:'4px 0 0'}}>${totalDia.toLocaleString('es-AR')}</p>
        </div>
      </div>

      {/* Cortes del día */}
      <div style={box}>
        <p style={{color:'#fff',fontWeight:'bold',fontSize:'14px',marginBottom:'12px'}}>✂️ Clientes atendidos</p>
        {cortesDelDia.length === 0
          ? <p style={{color:'#666',fontSize:'13px',margin:0}}>Sin cortes registrados este día.</p>
          : cortesDelDia.map(c => (
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid #2a2a2a'}}>
              <div style={{width:34,height:34,borderRadius:'50%',background:'#FF6B00',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:'13px',color:'#fff',flexShrink:0}}>
                {(c.nombre?.[0]??'')+(c.apellido?.[0]??'')}
              </div>
              <div style={{flex:1}}>
                <p style={{margin:0,fontWeight:'bold',fontSize:'14px',color:'#fff'}}>{c.nombre} {c.apellido}</p>
                <p style={{margin:0,fontSize:'12px',color:'#999'}}>{c.servicio==='pelo_barba'?'✂️🧔 Pelo + barba':'✂️ Solo pelo'}</p>
              </div>
              <span style={{color:'#FF6B00',fontWeight:'bold',fontSize:'13px'}}>
                ${(c.servicio==='pelo_barba'?17000:12000).toLocaleString('es-AR')}
              </span>
            </div>
          ))
        }
      </div>

      {/* Productos del día */}
      <div style={box}>
        <p style={{color:'#fff',fontWeight:'bold',fontSize:'14px',marginBottom:'12px'}}>🧴 Productos vendidos</p>
        {ventasDelDia.length === 0
          ? <p style={{color:'#666',fontSize:'13px',marginBottom:'12px'}}>Sin productos registrados.</p>
          : ventasDelDia.map(v => (
            <div key={v.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid #2a2a2a'}}>
              <div style={{flex:1}}>
                <p style={{margin:0,fontSize:'14px',color:'#fff'}}>{v.descripcion}</p>
              </div>
              <span style={{color:'#3b82f6',fontWeight:'bold',fontSize:'13px'}}>${(v.monto||0).toLocaleString('es-AR')}</span>
              <button onClick={()=>onDeleteVenta(v.id)}
                style={{background:'none',border:'none',color:'#666',cursor:'pointer',fontSize:'16px',padding:'0 4px'}}>🗑</button>
            </div>
          ))
        }
        {/* Formulario agregar producto */}
        <form onSubmit={handleAddVenta} style={{display:'flex',gap:'8px',marginTop:'12px',flexWrap:'wrap'}}>
          <input
            placeholder="Descripción (ej: Cera)"
            value={descForm} onChange={e=>setDescForm(e.target.value)}
            style={{flex:2,minWidth:'120px',padding:'8px 12px',borderRadius:'8px',border:'1px solid #333',background:'#111',color:'#fff',fontSize:'13px'}}
          />
          <input
            type="number" placeholder="Monto $"
            value={montoForm} onChange={e=>setMontoForm(e.target.value)}
            style={{flex:1,minWidth:'90px',padding:'8px 12px',borderRadius:'8px',border:'1px solid #333',background:'#111',color:'#fff',fontSize:'13px'}}
          />
          <button type="submit" disabled={savingV}
            style={{padding:'8px 16px',borderRadius:'8px',background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontWeight:'bold',fontSize:'13px'}}>
            {savingV?'...':'+ Agregar'}
          </button>
        </form>
      </div>

    </div>
  )
}

export default function Dashboard() {
  const [clients,setClients]   = useState([])
  const [ventas,setVentas]     = useState([])
  const [loading,setLoading]   = useState(true)
  const [filter,setFilter]     = useState('todos')
  const [search,setSearch]     = useState('')
  const [showForm,setShowForm] = useState(false)
  const [showStats,setShowStats] = useState(false)
  const [showDay,setShowDay]   = useState(false)
  const [deleting,setDeleting] = useState(null)
  const [saving,setSaving]     = useState(false)
  const [cardId,setCardId]     = useState(null)
  const [editing,setEditing]   = useState(null)
  const [editForm,setEditForm] = useState({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
  const [form,setForm] = useState({nombre:'',apellido:'',telefono:'',fechaCorte:todayISO,servicio:'pelo'})
  const canvasRef = useRef(null)

  useEffect(() => {
    const q=query(collection(db,'clientes'),orderBy('createdAt','desc'))
    const unsub1 = onSnapshot(q, snap => {
      setClients(snap.docs.map(d=>({id:d.id,...d.data()})))
      setLoading(false)
    })
    const q2=query(collection(db,'ventas'),orderBy('createdAt','desc'))
    const unsub2 = onSnapshot(q2, snap => {
      setVentas(snap.docs.map(d=>({id:d.id,...d.data()})))
    })
    return () => { unsub1(); unsub2() }
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
      if(filter==='semana')  { if(!(d>=0&&d<=7)) return false }
      if(filter==='urgente') { if(!(d>=0&&d<=3)) return false }
      if(filter==='activos') { if(!(d>=0)) return false }
      if(search.trim()) {
        const q=search.toLowerCase()
        const nombre=(c.nombre+' '+c.apellido).toLowerCase()
        const tel=(c.telefono||'').toLowerCase()
        if(!nombre.includes(q) && !tel.includes(q)) return false
      }
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
    setEditForm({ nombre:c.nombre, apellido:c.apellido, telefono:c.telefono||'', fechaCorte:c.fechaCorte, servicio:c.servicio||'pelo' })
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

  async function handleAddVenta(data) {
    try{ await addDoc(collection(db,'ventas'),{...data, createdAt:serverTimestamp()}) }
    catch(err){ alert('Error: '+err.message) }
  }

  async function handleDeleteVenta(id) {
    try{ await deleteDoc(doc(db,'ventas',id)) }
    catch(err){ alert('Error: '+err.message) }
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
            style={{background:'#fff',borderRadius:'12px',padding:'24px',width:'100%',maxWidth:'480px',display:'flex',flexDirection:'column',gap:'12px',maxHeight:'90vh',overflowY:'auto'}}>
            <h2 style={{margin:0,fontSize:'18px'}}>✏️ Editar cliente</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Nombre</label>
                <input type="text" value={editForm.nombre} required onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))} /></div>
              <div className={styles.field}><label>Apellido</label>
                <input type="text" value={editForm.apellido} required onChange={e=>setEditForm(f=>({...f,apellido:e.target.value}))} /></div>
              <div className={styles.field}><label>Teléfono</label>
                <input type="tel" value={editForm.telefono} onChange={e=>setEditForm(f=>({...f,telefono:e.target.value}))} /></div>
              <div className={styles.field}><label>Servicio</label>
                <select value={editForm.servicio} onChange={e=>setEditForm(f=>({...f,servicio:e.target.value}))}>
                  <option value="pelo">✂️ Corte de pelo — $12.000</option>
                  <option value="pelo_barba">✂️🧔 Pelo y barba — $17.000</option>
                </select></div>
              <div className={styles.field}><label>Fecha último corte</label>
                <input type="date" value={editForm.fechaCorte} required onChange={e=>setEditForm(f=>({...f,fechaCorte:e.target.value}))} /></div>
            </div>
            {editingClient && (()=>{
              const sellos = editingClient.sellos?.length ? [...editingClient.sellos].sort() : [editingClient.fechaCorte]
              return (
                <div style={{borderTop:'1px solid #eee',paddingTop:'12px'}}>
                  <p style={{margin:'0 0 8px',fontWeight:'bold',fontSize:'14px'}}>🎫 Sellos ({sellos.length}/10)</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'10px'}}>
                    {sellos.map((s,i)=>(<span key={i} style={{background:'#f0f0f0',borderRadius:'6px',padding:'3px 8px',fontSize:'12px'}}>{i+1}. {formatAR(s)}</span>))}
                  </div>
                  {sellos.length>1 && (
                    <button type="button" className={styles.btnDanger} style={{fontSize:'13px',padding:'6px 12px'}}
                      onClick={()=>handleRemoveLastSello(editing, sellos)}>
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

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>✂️ Promo Barbería</h1>
          <p className={styles.subtitle}>{todayLabel}</p>
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'flex-end'}}>
          <button className={styles.btnSecondary} onClick={()=>{setShowDay(v=>!v);setShowStats(false);setShowForm(false)}}>
            {showDay?'✕ Día':'📅 Día'}
          </button>
          <button className={styles.btnSecondary} onClick={()=>{setShowStats(v=>!v);setShowDay(false);setShowForm(false)}}>
            {showStats?'✕ Stats':'📊 Stats'}
          </button>
          <button className={styles.btnPrimary} onClick={()=>{setShowForm(v=>!v);setShowStats(false);setShowDay(false)}}>
            {showForm?'Cancelar':'+ Agregar'}
          </button>
        </div>
      </header>

      {showDay && <DayPanel clients={clients} ventas={ventas} onAddVenta={handleAddVenta} onDeleteVenta={handleDeleteVenta} />}
      {showStats && <StatsPanel clients={clients} />}

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

      <div className={styles.filters}>
        {[
          {key:'todos',   label:`Todos (${clients.length})`},
          {key:'semana',  label:`Esta semana (${semana})`},
          {key:'urgente', label:`Urgente (${urgente})`},
          {key:'activos', label:`Activos (${activos})`},
        ].map(f=>(
          <button key={f.key} className={`${styles.filterBtn} ${filter===f.key?styles.filterActive:''}`}
            onClick={()=>setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      <input type="text" placeholder="🔍 Buscar por nombre o teléfono..."
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{width:'100%',padding:'10px 14px',borderRadius:'8px',border:'1px solid #333',
          background:'#1a1a1a',color:'#fff',fontSize:'14px',boxSizing:'border-box',marginBottom:'8px'}}
      />

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