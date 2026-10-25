import React, { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, Plus, StickyNote, ImagePlus, Trash2, ZoomIn, ZoomOut, MousePointer2, Film } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn } from '../components/ui.jsx'
import { fileToDataURL, seedImg } from '../lib/engine.js'

const NOTE_COLORS = ['#d9ff4a','#ff9ecb','#8ecbff','#ffd28e','#c9b8ff','#ffffff']

export default function CanvasPage() {
  const { assets, toast } = useApp()
  const nav = useNavigate()
  const [cards, setCards] = useState(()=>{ try { return JSON.parse(localStorage.getItem('hf_canvas')||'null') } catch { return null } })
  const [zoom, setZoom] = useState(1)
  const [showLib, setShowLib] = useState(false)
  const drag = useRef(null); const fileRef = useRef(null)

  useEffect(()=>{ if (!cards) setCards([
    { id:'n1', kind:'note', x:60, y:56, w:210, text:'MOODBOARD — “Neon Tide” campaign. References, frames and wild ideas live here.', color:'#d9ff4a' },
    { id:'i1', kind:'img', x:300, y:60, w:250, url: seedImg('canvas-neon', 640, 420), label:'Key visual ref' },
    { id:'i2', kind:'img', x:110, y:300, w:200, url: seedImg('canvas-portrait', 520, 640), label:'Character study' },
    { id:'n2', kind:'note', x:590, y:200, w:190, text:'Palette: acid lime × deep violet. Type: Archivo Black, tracked tight.', color:'#c9b8ff' },
    { id:'i3', kind:'img', x:420, y:360, w:270, url: seedImg('canvas-city', 700, 460), label:'Location scout' },
  ]) },[])
  useEffect(()=>{ if (cards) localStorage.setItem('hf_canvas', JSON.stringify(cards)) },[cards])
  if (!cards) return null

  const onDown = (e, card) => {
    if (e.target.closest('button,textarea,input')) return
    const pt = e.touches ? e.touches[0] : e
    drag.current = { id: card.id, dx: pt.clientX/zoom - card.x, dy: pt.clientY/zoom - card.y }
    setCards(cs=>[...cs.filter(c=>c.id!==card.id), card])
  }
  const onMove = (e) => {
    if (!drag.current) return
    const pt = e.touches ? e.touches[0] : e
    const { id, dx, dy } = drag.current
    setCards(cs=>cs.map(c=>c.id===id ? {...c, x: pt.clientX/zoom - dx, y: pt.clientY/zoom - dy} : c))
  }
  const end = () => drag.current = null

  const addNote = () => setCards(cs=>[...cs, { id:'n'+Date.now(), kind:'note', x:120+Math.random()*220, y:110+Math.random()*180, w:200, text:'New idea…', color: NOTE_COLORS[Math.floor(Math.random()*NOTE_COLORS.length)] }])
  const addAsset = (a) => { setCards(cs=>[...cs, { id:'i'+Date.now(), kind: a.type==='video'?'video':'img', x:150+Math.random()*240, y:120+Math.random()*200, w:250, url:a.url, label:a.prompt?.slice(0,40)||'Generation', assetId:a.id }]); setShowLib(false) }
  const addUpload = async (e) => { const f=e.target.files?.[0]; if(f){ const url=await fileToDataURL(f); setCards(cs=>[...cs,{id:'i'+Date.now(),kind:'img',x:170,y:140,w:250,url,label:f.name}]) } }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-line bg-[#0c0c0e]">
        <span className="h-9 w-9 grid place-items-center rounded-xl bg-lime text-black"><LayoutDashboard size={17}/></span>
        <div className="mr-2"><h1 className="font-black leading-none" style={{fontFamily:'Archivo'}}>CANVAS</h1><p className="text-[11px] text-zinc-500">Drag anything. Films start as chaos.</p></div>
        <Btn className="!py-2" onClick={addNote}><StickyNote size={14}/> Note</Btn>
        <Btn className="!py-2" onClick={()=>fileRef.current.click()}><ImagePlus size={14}/> Upload</Btn>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={addUpload} />
        <Btn className="!py-2" onClick={()=>setShowLib(!showLib)}><Plus size={14}/> From library</Btn>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={()=>setZoom(z=>Math.max(.4, +(z-.12).toFixed(2)))} className="h-8 w-8 grid place-items-center rounded-full bg-panel2 border border-line hover:border-zinc-500"><ZoomOut size={14}/></button>
          <span className="text-[12px] font-bold text-zinc-400 w-10 text-center tabular-nums">{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>Math.min(1.8, +(z+.12).toFixed(2)))} className="h-8 w-8 grid place-items-center rounded-full bg-panel2 border border-line hover:border-zinc-500"><ZoomIn size={14}/></button>
          <Btn kind="lime" className="!py-2 ml-2" onClick={()=>{ nav('/cinema'); toast('Canvas pinned as reference for Cinema Studio') }}><Film size={14}/> Send to Cinema</Btn>
        </div>
      </div>
      {showLib && (
        <div className="border-b border-line bg-panel px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
          {assets.length===0 && <p className="text-sm text-zinc-500">Generate something first — your library is empty.</p>}
          {assets.slice(0,24).map(a=><img key={a.id} src={a.url} alt="" onClick={()=>addAsset(a)} className="h-16 w-24 object-cover rounded-xl cursor-pointer hover:ring-2 ring-lime shrink-0" />)}
        </div>
      )}
      <div className="relative flex-1 overflow-auto bg-[#0e0e10]" style={{ backgroundImage:'radial-gradient(circle, #26262b 1px, transparent 1px)', backgroundSize:'26px 26px', touchAction:'none' }}
        onMouseMove={onMove} onMouseUp={end} onMouseLeave={end} onTouchMove={onMove} onTouchEnd={end}>
        <div className="relative origin-top-left" style={{ width:2400, height:1500, transform:`scale(${zoom})` }}>
          {cards.map(c=>(
            <div key={c.id} onMouseDown={e=>onDown(e,c)} onTouchStart={e=>onDown(e,c)}
              className="absolute rounded-2xl shadow-2xl select-none cursor-grab active:cursor-grabbing group"
              style={{ left:c.x, top:c.y, width:c.w, touchAction:'none' }}>
              {c.kind==='note' ? (
                <div className="rounded-2xl p-3.5 min-h-[120px]" style={{background:c.color}}>
                  <textarea value={c.text} onChange={e=>setCards(cs=>cs.map(x=>x.id===c.id?{...x,text:e.target.value}:x))}
                    className="w-full bg-transparent text-black font-semibold text-[13px] leading-snug resize-none border-none min-h-[84px]" style={{borderColor:'transparent'}} />
                  <div className="flex gap-1 mt-1">{NOTE_COLORS.map(col=><button key={col} onClick={()=>setCards(cs=>cs.map(x=>x.id===c.id?{...x,color:col}:x))} className="h-4 w-4 rounded-full border border-black/25" style={{background:col}} />)}</div>
                </div>
              ) : (
                <figure className="rounded-2xl overflow-hidden border border-line bg-panel">
                  <img src={c.url} alt="" draggable={false} className="w-full object-cover max-h-[300px]" />
                  <figcaption className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-400"><MousePointer2 size={11} className="text-lime shrink-0"/><span className="truncate">{c.label || (c.kind==='video'?'Video generation':'Image')}</span></figcaption>
                </figure>
              )}
              <span className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={()=>setCards(cs=>cs.map(x=>x.id===c.id?{...x,w:Math.min(520,x.w+36)}:x))} className="h-6 w-6 grid place-items-center rounded-full bg-white text-black text-sm font-black shadow">+</button>
                <button onClick={()=>setCards(cs=>cs.map(x=>x.id===c.id?{...x,w:Math.max(120,x.w-36)}:x))} className="h-6 w-6 grid place-items-center rounded-full bg-white text-black text-sm font-black shadow">−</button>
                <button onClick={()=>setCards(cs=>cs.filter(x=>x.id!==c.id))} className="h-6 w-6 grid place-items-center rounded-full bg-red-500 text-white shadow"><Trash2 size={11}/></button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
