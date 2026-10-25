import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Clapperboard, Image as ImageIcon, Film, AudioLines, Fingerprint, Sparkles, LayoutDashboard, Megaphone, Cpu, FolderOpen, GraduationCap, Crown, Search, Coins, ChevronDown, X, Loader2, CheckCircle2, Play, Command, Settings, LogOut, User, Zap, Heart, Download, Trash2, Repeat2, Menu, TriangleAlert } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Logo, Btn, MotionImage, FxOverlay, ProgressBar } from './ui.jsx'
import { EFFECTS, VIDEO_MODELS, IMAGE_MODELS, CAMERA_PRESETS } from '../data/catalog.js'
import { downloadImage } from '../lib/engine.js'

export const NAV = [
  { to:'/', icon:Compass, label:'Explore' },
  { to:'/video', icon:Clapperboard, label:'Create Video', badge:'Seedance 2.5' },
  { to:'/image', icon:ImageIcon, label:'Create Image' },
  { to:'/cinema', icon:Film, label:'Cinema Studio', badge:'4.0' },
  { to:'/speak', icon:AudioLines, label:'Speak' },
  { to:'/soul', icon:Fingerprint, label:'Soul ID' },
  { to:'/effects', icon:Sparkles, label:'Effects', badge:'60+' },
  { to:'/canvas', icon:LayoutDashboard, label:'Canvas' },
  { to:'/influencer', icon:Megaphone, label:'AI Influencer' },
  { to:'/agent', icon:Cpu, label:'Supercomputer', badge:'GPT-6' },
  { to:'/library', icon:FolderOpen, label:'My Library' },
  { to:'/academy', icon:GraduationCap, label:'Academy' },
]

export function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, setAuthOpen, assets, jobs } = useApp()
  const active = jobs.filter(j=>j.status==='rendering').length
  const inner = (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-2 flex items-center justify-between">
        <NavLink to="/"><Logo /></NavLink>
        <button className="lg:hidden text-zinc-400" onClick={()=>setMobileOpen(false)}><X size={20}/></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-0.5">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to==='/'} onClick={()=>setMobileOpen(false)}
            className={({isActive})=>cx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition', isActive ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5')}>
            {({isActive})=> (<>
              <n.icon size={19} className={isActive?'':'group-hover:text-lime transition'} />
              <span className="flex-1">{n.label}</span>
              {n.to==='/library' && assets.length>0 && <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md', isActive?'bg-black/10 text-black':'bg-panel3 text-zinc-400')}>{assets.length}</span>}
              {n.badge && <span className={cx('text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-md', isActive ? 'bg-black text-lime' : 'bg-lime/15 text-lime')}>{n.badge}</span>}
            </>)}
          </NavLink>
        ))}
        <div className="pt-4 px-1">
          <div className="rounded-2xl border border-lime/25 bg-gradient-to-br from-lime/15 via-panel2 to-violet-600/15 p-3.5">
            <div className="flex items-center gap-1.5 text-lime font-extrabold text-[13px]"><Zap size={14}/> SEEDANCE 2.5 SALE</div>
            <p className="text-[12px] text-zinc-400 mt-1 leading-snug">Unlimited Nano Banana Pro + extra discount on annual plans.</p>
            <NavLink to="/pricing" onClick={()=>setMobileOpen(false)}><Btn kind="lime" className="w-full mt-3 !py-2 text-[13px]">Get your discount</Btn></NavLink>
          </div>
        </div>
      </nav>
      <div className="p-3 border-t border-line">
        {user ? (
          <NavLink to="/settings" onClick={()=>setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5 transition">
            <span className="h-9 w-9 rounded-full bg-gradient-to-br from-lime to-emerald-500 grid place-items-center font-black text-black text-sm">{(user.name||'U')[0].toUpperCase()}</span>
            <span className="flex-1 min-w-0"><span className="block text-sm font-bold truncate">{user.name}</span><span className="block text-[11px] text-zinc-500 capitalize">{active? `${active} rendering…` : 'Plus Trial'}</span></span>
            <Settings size={16} className="text-zinc-500" />
          </NavLink>
        ) : (
          <Btn kind="white" className="w-full" onClick={()=>setAuthOpen(true)}>Sign in</Btn>
        )}
      </div>
    </div>
  )
  return (<>
    <aside className="hidden lg:block w-[248px] shrink-0 border-r border-line bg-[#0c0c0e] h-screen sticky top-0">{inner}</aside>
    <AnimatePresence>{mobileOpen && (
      <motion.div className="fixed inset-0 z-[80] lg:hidden" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
        <div className="absolute inset-0 bg-black/70" onClick={()=>setMobileOpen(false)} />
        <motion.aside initial={{x:-260}} animate={{x:0}} exit={{x:-260}} transition={{type:'spring',damping:28,stiffness:320}} className="absolute left-0 top-0 bottom-0 w-[248px] bg-[#0c0c0e] border-r border-line">{inner}</motion.aside>
      </motion.div>)}
    </AnimatePresence>
  </>)
}

export function Topbar({ setMobileOpen }) {
  const { credits, setPaletteOpen, user, setAuthOpen, plan } = useApp()
  const nav = useNavigate(); const loc = useLocation()
  const [q, setQ] = useState('')
  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 sm:gap-3 border-b border-line bg-[#0a0a0b]/85 backdrop-blur-xl px-3 sm:px-5 h-[60px]">
      <button className="lg:hidden text-zinc-300 p-1" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button>
      <button onClick={()=>setPaletteOpen(true)} className="hidden sm:flex flex-1 max-w-md items-center gap-2.5 rounded-full bg-panel2 border border-line px-4 py-2 text-sm text-zinc-500 hover:border-zinc-600 transition">
        <Search size={16}/> <span className="flex-1 text-left">Search models, effects, creations…</span>
        <kbd className="flex items-center gap-0.5 text-[10px] font-bold bg-panel3 border border-line rounded-md px-1.5 py-0.5 text-zinc-400"><Command size={10}/>K</kbd>
      </button>
      <button onClick={()=>setPaletteOpen(true)} className="sm:hidden text-zinc-300 p-1"><Search size={20}/></button>
      <div className="flex-1 sm:hidden" />
      <div className="hidden md:flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{loc.pathname==='/' ? 'Explore' : ''}</div>
      <button onClick={()=>nav('/pricing')} className="flex items-center gap-2 rounded-full bg-panel2 border border-line pl-3 pr-1 py-1 hover:border-lime/50 transition group">
        <Coins size={16} className="text-lime" /><span className="font-extrabold text-sm tabular-nums">{credits.toLocaleString()}</span>
        <span className="text-[11px] text-zinc-500 font-semibold hidden sm:inline">credits</span>
        <span className="rounded-full bg-lime text-black text-[11px] font-extrabold px-2.5 py-1 group-hover:bg-[#eaff85]">Top up</span>
      </button>
      <Btn kind="lime" className="!px-4 !py-2 hidden md:inline-flex" onClick={()=>nav('/pricing')}><Crown size={15}/> Upgrade</Btn>
      {user
        ? <button onClick={()=>nav('/settings')} className="h-9 w-9 rounded-full bg-gradient-to-br from-lime to-emerald-500 grid place-items-center font-black text-black text-sm shrink-0">{(user.name||'U')[0].toUpperCase()}</button>
        : <Btn kind="white" className="!px-4 !py-2" onClick={()=>setAuthOpen(true)}>Sign in</Btn>}
    </header>
  )
}

export function Toasts() {
  const { toasts, assets, openPlayer } = useApp()
  return <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center gap-2 w-[min(92vw,480px)]">
    <AnimatePresence>{toasts.map(t => (
      <motion.div key={t.id} initial={{y:24,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}} exit={{y:10,opacity:0}}
        className="w-full flex items-center gap-3 rounded-2xl bg-[#1b1b1f] border border-line shadow-2xl px-4 py-3">
        {t.kind==='warn' ? <span className="text-amber-400 text-lg leading-none">⚠</span> : <CheckCircle2 size={18} className="text-lime shrink-0" />}
        <p className="flex-1 text-sm font-medium leading-snug">{t.msg}</p>
        {t.action?.assetId && <button className="text-lime text-sm font-bold shrink-0 hover:underline" onClick={()=>{ const a=assets.find(x=>x.id===t.action.assetId); if(a) openPlayer(a) }}>View</button>}
      </motion.div>))}
    </AnimatePresence>
  </div>
}

export function JobDock() {
  const { jobs, dismissJob, cancelJob, stageLabel, assets, openPlayer } = useApp()
  const visible = jobs.filter(j=>j.status==='rendering' || (j.status==='done'))
  const [open, setOpen] = useState(true)
  useEffect(()=>{ if (jobs.some(j=>j.status==='rendering')) setOpen(true) },[jobs.length])
  if (!visible.length) return null
  const rendering = jobs.filter(j=>j.status==='rendering')
  return <div className="fixed bottom-5 right-4 z-[70] w-[min(92vw,360px)]">
    <div className="rounded-3xl bg-[#141417]/95 backdrop-blur border border-line shadow-2xl overflow-hidden">
      <button className="w-full flex items-center gap-2.5 px-4 py-3 text-left" onClick={()=>setOpen(!open)}>
        {rendering.length ? <Loader2 size={16} className="animate-spin text-lime"/> : <CheckCircle2 size={16} className="text-lime"/>}
        <span className="flex-1 text-sm font-bold">{rendering.length ? `Rendering ${rendering.length} job${rendering.length>1?'s':''}…` : 'Render queue'}</span>
        <ChevronDown size={16} className={cx('text-zinc-500 transition', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>{open && <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
        <div className="px-3 pb-3 space-y-2 max-h-[46vh] overflow-y-auto">
          {[...visible].reverse().slice(0,6).map(j => (
            <div key={j.id} className="rounded-2xl bg-panel2 border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-panel3 text-zinc-300">{j.type}</span>
                <p className="flex-1 text-[13px] font-semibold truncate">{j.prompt?.slice(0,44) || j.label || 'Generation'}</p>
                {j.status==='rendering'
                  ? <button onClick={()=>cancelJob(j.id)} className="text-zinc-500 hover:text-red-300"><X size={15}/></button>
                  : <button onClick={()=>dismissJob(j.id)} className="text-zinc-500 hover:text-white"><X size={15}/></button>}
              </div>
              {j.status==='rendering' ? (<>
                <ProgressBar value={j.progress} className="mt-2.5" />
                <div className="flex justify-between mt-1.5 text-[11px] text-zinc-500"><span className="text-lime/90 font-semibold">{stageLabel(j)}</span><span className="tabular-nums">{Math.round(j.progress)}% · {j.modelName}</span></div>
              </>) : (
                <button className="mt-2 flex items-center gap-1.5 text-[12px] font-bold text-lime hover:underline" onClick={()=>{ const a=assets.find(x=>j._assetIds?.includes(x.id)); if(a) openPlayer(a) }}><Play size={12}/> Open result</button>
              )}
            </div>
          ))}
        </div>
      </motion.div>}</AnimatePresence>
    </div>
  </div>
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useApp()
  const nav = useNavigate(); const [q,setQ] = useState('')
  useEffect(()=>{ if(paletteOpen) setQ('') },[paletteOpen])
  useEffect(()=>{
    const h = (e)=>{ if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); setPaletteOpen(v=>!v) } if(e.key==='Escape') setPaletteOpen(false) }
    window.addEventListener('keydown', h); return ()=>window.removeEventListener('keydown', h)
  },[])
  const items = useMemo(()=>{
    const ql = q.toLowerCase()
    const all = [
      ...NAV.map(n=>({ label:n.label, hint:'Go to page', go:()=>nav(n.to) })),
      ...VIDEO_MODELS.map(m=>({ label:m.name, hint:'Video model · '+m.vendor, go:()=>nav('/video?model='+m.id) })),
      ...IMAGE_MODELS.map(m=>({ label:m.name, hint:'Image model · '+m.vendor, go:()=>nav('/image?model='+m.id) })),
      ...CAMERA_PRESETS.map(c=>({ label:c.name, hint:'Camera · '+c.category, go:()=>nav('/video?camera='+c.id) })),
      ...EFFECTS.map(e=>({ label:e.name, hint:'Effect · '+e.category, go:()=>nav('/video?effect='+e.id) })),
      { label:'Pricing & credits', hint:'Plans', go:()=>nav('/pricing') },
      { label:'Settings & profile', hint:'Account', go:()=>nav('/settings') },
    ]
    return all.filter(i=> i.label.toLowerCase().includes(ql) || i.hint.toLowerCase().includes(ql)).slice(0, 11)
  },[q, nav])
  return <AnimatePresence>{paletteOpen && (
    <motion.div className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh] px-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={()=>setPaletteOpen(false)} />
      <motion.div initial={{scale:.97,y:-8}} animate={{scale:1,y:0}} exit={{scale:.97,y:-8}} className="relative w-full max-w-xl bg-panel border border-line rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line"><Search size={19} className="text-zinc-500"/>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search everything — models, effects, cameras, pages…" className="flex-1 bg-transparent text-[15px] placeholder:text-zinc-600 border-none" />
          <kbd className="text-[10px] font-bold bg-panel3 rounded px-1.5 py-0.5 text-zinc-500">ESC</kbd></div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {items.length===0 && <p className="text-center text-zinc-500 text-sm py-8">Nothing matched “{q}”.</p>}
          {items.map((i,ix)=>(
            <button key={ix} onClick={()=>{ i.go(); setPaletteOpen(false) }} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 transition group">
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate group-hover:text-lime transition">{i.label}</span><span className="block text-[11px] text-zinc-500">{i.hint}</span></span>
              <span className="text-zinc-600 text-xs">↵</span>
            </button>))}
        </div>
      </motion.div>
    </motion.div>)}
  </AnimatePresence>
}

export function AssetCard({ asset, ratioClass='aspect-[4/3]' }) {
  const { openPlayer, toggleFav, deleteAsset, toast } = useApp()
  const nav = useNavigate(); const [hover,setHover] = useState(false)
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-line bg-panel2 cursor-pointer" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onClick={()=>openPlayer(asset)}>
      <MotionImage src={asset.url} motionId={asset.motionId} playing={hover && asset.type==='video'} duration={asset.duration||6} filter={asset.filter} className={cx('w-full', ratioClass)} />
      <FxOverlay overlay={hover ? asset.overlay : 'none'} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3 pt-8 z-[6]">
        <p className="text-[12px] font-medium leading-snug line-clamp-2 text-zinc-200">{asset.prompt || asset.label || 'Untitled'}</p>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-bold text-zinc-400">
          <span className="bg-white/10 rounded px-1.5 py-0.5 uppercase">{asset.type}</span>
          <span>{asset.modelName}</span>{asset.duration && <span>· {asset.duration}s</span>}
        </div>
      </div>
      {asset.type==='video' && <span className="absolute top-2.5 left-2.5 z-[6] h-8 w-8 grid place-items-center rounded-full bg-black/55 border border-white/15"><Play size={13} className="ml-0.5"/></span>}
      <div className="absolute top-2.5 right-2.5 z-[7] flex gap-1.5 opacity-0 group-hover:opacity-100 transition" onClick={e=>e.stopPropagation()}>
        <button title="Favorite" onClick={()=>toggleFav(asset.id)} className={cx('h-8 w-8 grid place-items-center rounded-full bg-black/60 border border-white/15 hover:bg-black', asset.fav && 'text-red-400')}><Heart size={14} fill={asset.fav?'currentColor':'none'}/></button>
        <button title="Remix" onClick={()=>{ nav(asset.type==='video'?'/video':'/image', { state:{ prompt:asset.prompt, motionId:asset.motionId, effectId:asset.effectId } }); toast('Loaded into the studio — remix away') }} className="h-8 w-8 grid place-items-center rounded-full bg-black/60 border border-white/15 hover:bg-black"><Repeat2 size={14}/></button>
        <button title="Download still" onClick={()=>downloadImage(asset.url, 'higgsfield-'+asset.id+'.jpg')} className="h-8 w-8 grid place-items-center rounded-full bg-black/60 border border-white/15 hover:bg-black"><Download size={14}/></button>
        <button title="Delete" onClick={()=>deleteAsset(asset.id)} className="h-8 w-8 grid place-items-center rounded-full bg-black/60 border border-white/15 hover:bg-black hover:text-red-300"><Trash2 size={14}/></button>
      </div>
    </div>
  )
}
