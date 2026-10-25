import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Pause, Loader2 } from 'lucide-react'
import { motionAt, pingpong, motionById, seedImg } from '../lib/engine.js'

export const cx = (...a) => a.filter(Boolean).join(' ')

// Animated "video" surface — drives an image with the MotionEngine
export function MotionImage({ src, motionId='slow-push-in', playing=true, duration=6, filter='none', className='', imgClassName='', speed=1 }) {
  const ref = useRef(null); const raf = useRef(0)
  const preset = motionById(motionId)
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (!playing) { const tr = motionAt(preset.motion, .35, 0); el.style.transform = `scale(${tr.scale}) translate(${tr.x}%,${tr.y}%) rotate(${tr.rot}deg)`; return }
    const t0 = performance.now()
    const loop = (now) => {
      const t = pingpong(((now - t0) / 1000) / (duration / speed))
      const tr = motionAt(preset.motion, t, now)
      el.style.transform = `scale(${tr.scale}) translate(${tr.x}%,${tr.y}%) rotate(${tr.rot}deg)`
      el.style.filter = `${filter==='none'?'':filter} ${tr.blur?`blur(${tr.blur}px)`:''}`
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return ()=>cancelAnimationFrame(raf.current)
  }, [playing, motionId, duration, filter, speed])
  return (
    <div className={cx('relative overflow-hidden bg-panel2', className)}>
      <img ref={ref} src={src} alt="" draggable={false}
        onError={e=>{ if(!e.currentTarget.dataset.fb){ e.currentTarget.dataset.fb=1; e.currentTarget.src = seedImg('fallback'+ (src?.length||7), 960, 640) } }}
        className={cx('absolute inset-0 h-full w-full object-cover will-change-transform', imgClassName)}
        style={{ filter: filter==='none' ? undefined : filter }} />
    </div>
  )
}

// particle overlay for live preview (CSS-driven, cheap version of canvas fx)
export function FxOverlay({ overlay }) {
  if (!overlay || overlay==='none') return null
  const items = Array.from({length: overlay==='rain'?36:22}, (_,i)=>i)
  const char = { money:'$', confetti:'▬', snow:'●', sparks:'✦', dust:'·', bubbles:'○', fire:'▲' }[overlay]
  if (overlay==='rain') return <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60 z-[4]">{items.map(i=><span key={i} className="absolute w-px h-8 bg-sky-200/70" style={{ left:`${(i*37)%100}%`, top:`${(i*53)%100}%`, transform:'rotate(12deg)', animation:`fxfall ${0.5+((i*7)%10)/14}s linear infinite`, animationDelay:`-${(i%9)/3}s` }} />)}<style>{`@keyframes fxfall{from{transform:translateY(-30px) rotate(12deg)}to{transform:translateY(60px) rotate(12deg)}}`}</style></div>
  if (overlay==='explosion' || overlay==='impact') return <div className="pointer-events-none absolute inset-0 z-[4] flex items-end justify-center"><div className="w-3/4 h-2/3 rounded-full blur-2xl" style={{ background:'radial-gradient(circle,#fff3c4 0%,#ff8c1e 40%,transparent 70%)', animation:'boomfx 2.4s ease-in-out infinite' }} /><style>{`@keyframes boomfx{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:.85;transform:scale(1.1)}}`}</style></div>
  if (overlay==='glitch' || overlay==='vhs' || overlay==='grain-heavy' || overlay==='halftone' || overlay==='flicker') return <div className="pointer-events-none absolute inset-0 z-[4] mix-blend-overlay opacity-50" style={{ background: overlay==='halftone' ? 'radial-gradient(circle, #000 1px, transparent 1.5px) 0 0/9px 9px' : 'repeating-linear-gradient(0deg, rgba(255,255,255,.25) 0 1px, transparent 1px 4px)' }} />
  if (overlay==='lightning') return <div className="pointer-events-none absolute inset-0 z-[4] bg-sky-100" style={{ animation:'boltfx 3.7s steps(1) infinite', opacity:0 }}><style>{`@keyframes boltfx{0%,92%,96%,100%{opacity:0}93%,95%{opacity:.45}}`}</style></div>
  if (!char) return null
  return <div className="pointer-events-none absolute inset-0 overflow-hidden z-[4]">{items.map(i=><span key={i} className="absolute font-bold" style={{ left:`${(i*43)%100}%`, top:`${(i*29)%110-10}%`, fontSize: overlay==='money'?15:10, color: {money:'#7ed957',confetti:['#d9ff4a','#ff477e','#4ac8ff','#ffb84a'][i%4],snow:'#fff',sparks:'#ffe89e',dust:'#ffdc9e',bubbles:'#bee6ff',fire:'#ff8c3a'}[overlay], opacity:.85, animation:`fxfloat ${2.6+((i*7)%10)/4}s linear infinite`, animationDelay:`-${(i%11)/2}s` }}>{char}</span>)}<style>{`@keyframes fxfloat{from{transform:translateY(24px) rotate(0deg)}to{transform:translateY(-120px) rotate(160deg)}}`}</style></div>
}

export function Btn({ children, kind='ghost', className='', ...p }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sm transition active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap'
  const kinds = {
    lime: 'bg-lime text-black hover:bg-[#eaff85] px-5 py-2.5',
    white: 'bg-white text-black hover:bg-zinc-200 px-5 py-2.5',
    ghost: 'bg-panel3 text-zinc-100 hover:bg-[#2a2a30] border border-line px-4 py-2',
    plain: 'text-zinc-300 hover:text-white hover:bg-white/5 px-3 py-2',
    danger: 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 px-4 py-2',
  }
  return <button className={cx(base, kinds[kind], className)} {...p}>{children}</button>
}

export function Chip({ active, children, className='', ...p }) {
  return <button className={cx('rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition whitespace-nowrap active:scale-95', active ? 'bg-lime text-black border-lime' : 'bg-panel2 text-zinc-300 border-line hover:border-zinc-500 hover:text-white', className)} {...p}>{children}</button>
}

export function Seg({ options, value, onChange, size='md' }) {
  return <div className="flex bg-panel2 border border-line rounded-full p-1 gap-1 w-fit max-w-full overflow-x-auto no-scrollbar">
    {options.map(o => { const v = typeof o==='string'?o:o.id; const label = typeof o==='string'?o:o.label;
      return <button key={v} onClick={()=>onChange(v)} className={cx('rounded-full font-semibold transition whitespace-nowrap', size==='sm'?'px-2.5 py-1 text-xs':'px-3.5 py-1.5 text-[13px]', value===v ? 'bg-white text-black' : 'text-zinc-400 hover:text-white')}>{label}</button> })}
  </div>
}

export function Field({ label, children, right }) {
  return <div className="mb-4">
    <div className="flex items-center justify-between mb-2"><label className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</label>{right}</div>
    {children}
  </div>
}

export function Modal({ open, onClose, children, wide }) {
  return <AnimatePresence>{open && (
    <motion.div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{scale:.96, y:14, opacity:0}} animate={{scale:1,y:0,opacity:1}} exit={{scale:.97,y:8,opacity:0}} transition={{type:'spring',damping:26,stiffness:300}}
        className={cx('relative w-full bg-panel border border-line rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto', wide ? 'max-w-5xl' : 'max-w-lg')}>
        <button onClick={onClose} className="absolute top-3 right-3 z-20 h-9 w-9 grid place-items-center rounded-full bg-black/60 border border-white/10 text-zinc-300 hover:text-white hover:bg-black"><X size={17}/></button>
        {children}
      </motion.div>
    </motion.div>)}
  </AnimatePresence>
}

export function Spin({size=16}) { return <Loader2 size={size} className="animate-spin" /> }

export function ProgressBar({ value, className='' }) {
  return <div className={cx('h-1.5 rounded-full bg-panel3 overflow-hidden', className)}><div className="h-full bg-lime rounded-full transition-all duration-200" style={{width:`${value}%`}} /></div>
}

export function EmptyState({ icon:Icon, title, sub, action }) {
  return <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    {Icon && <div className="h-14 w-14 rounded-2xl bg-panel3 border border-line grid place-items-center mb-4 text-zinc-500"><Icon size={24}/></div>}
    <h3 className="font-bold text-lg">{title}</h3><p className="text-zinc-500 text-sm mt-1 max-w-sm">{sub}</p>{action && <div className="mt-5">{action}</div>}
  </div>
}

export function Logo({ size=28 }) {
  return <span className="inline-flex items-center gap-2">
    <span className="grid place-items-center rounded-[9px] bg-lime text-black font-black" style={{width:size,height:size,fontSize:size*.52, fontFamily:'Archivo'}}>H</span>
    <span className="font-extrabold tracking-tight text-[17px]" style={{fontFamily:'Archivo'}}>HIGGSFIELD</span>
  </span>
}

export function AspectIcon({ ratio, active }) {
  const [w,h] = ratio.split(':').map(Number); const s = 16/Math.max(w,h)
  return <span className={cx('inline-block border-[1.5px] rounded-[3px]', active?'border-black':'border-zinc-400')} style={{width:w*s, height:h*s}} />
}
