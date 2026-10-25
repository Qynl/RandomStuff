import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Play, Clock, Layers, CheckCircle2, ChevronRight } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Modal, MotionImage, ProgressBar, Chip } from '../components/ui.jsx'
import { ACADEMY } from '../data/catalog.js'
import { seedImg } from '../lib/engine.js'

export default function Academy() {
  const { toast } = useApp()
  const [open, setOpen] = useState(null)
  const [level, setLevel] = useState('All')
  const [done, setDone] = useState(()=>{ try { return JSON.parse(localStorage.getItem('hf_academy_done')||'[]') } catch { return [] } })
  const [watching, setWatching] = useState(0)
  const list = ACADEMY.filter(c=> level==='All' || c.level===level)

  const toggleDone = (key) => setDone(d=>{ const n = d.includes(key) ? d.filter(x=>x!==key) : [...d,key]; localStorage.setItem('hf_academy_done', JSON.stringify(n)); return n })

  return (
    <div className="p-4 sm:p-6 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><GraduationCap size={21}/></span>
        <div className="flex-1"><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>HIGGSFIELD ACADEMY</h1>
        <p className="text-[12px] text-zinc-500">Learn to create AI images and videos, step by step. {done.length} lessons completed.</p></div>
        <div className="flex gap-1.5">{['All','Beginner','Intermediate','Advanced'].map(l=><Chip key={l} active={level===l} onClick={()=>setLevel(l)}>{l}</Chip>)}</div>
      </header>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
        {list.map(c=>{
          const prog = c.topics.filter((_,i)=>done.includes(c.id+'-'+i)).length / c.topics.length * 100
          return (
            <article key={c.id} className="group rounded-3xl border border-line bg-panel overflow-hidden cursor-pointer hover:border-zinc-500 transition" onClick={()=>{setOpen(c); setWatching(0)}}>
              <div className="relative">
                <MotionImage src={seedImg(c.seed, 880, 460)} motionId="slow-push-in" className="aspect-[16/8] w-full" imgClassName="brightness-[.7]" />
                <span className="absolute top-3 left-3 text-[10px] font-extrabold bg-black/60 border border-white/15 rounded-md px-2 py-1 uppercase tracking-wider">{c.level}</span>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 grid place-items-center rounded-full bg-lime text-black opacity-0 group-hover:opacity-100 transition scale-90 group-hover:scale-100"><Play size={19} className="ml-0.5"/></span>
              </div>
              <div className="p-4.5 p-5">
                <h3 className="font-extrabold text-[16px] leading-tight">{c.title}</h3>
                <p className="text-[12.5px] text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">{c.desc}</p>
                <div className="flex items-center gap-3 text-[11px] font-bold text-zinc-500 mt-3">
                  <span className="inline-flex items-center gap-1"><Layers size={11}/>{c.lessons} lessons</span>
                  <span className="inline-flex items-center gap-1"><Clock size={11}/>{c.mins} min</span>
                  {prog>0 && <span className="text-lime">{Math.round(prog)}% done</span>}
                </div>
                {prog>0 && <ProgressBar value={prog} className="mt-2.5" />}
              </div>
            </article>
          )})}
      </div>

      <Modal open={!!open} onClose={()=>setOpen(null)} wide>
        {open && <div>
          <div className="relative grain">
            <MotionImage src={seedImg(open.seed+'-lesson', 1280, 560)} motionId={['slow-push-in','crane-up-reveal','gimbal-chase','bullet-time'][watching%4]} duration={8} className="aspect-[16/7] w-full" imgClassName="brightness-[.75]" />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-14">
              <span className="text-[11px] font-mono font-bold text-lime tracking-widest">LESSON {watching+1} / {open.lessons}</span>
              <h3 className="font-black text-xl sm:text-2xl mt-1" style={{fontFamily:'Archivo'}}>{open.topics[watching % open.topics.length]}</h3>
            </div>
          </div>
          <div className="p-6 grid sm:grid-cols-[1fr_280px] gap-6">
            <div>
              <h4 className="font-extrabold">{open.title}</h4>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{open.desc}</p>
              <div className="rounded-2xl bg-panel2 border border-line p-4 mt-4 text-[13px] leading-relaxed text-zinc-300">
                <b className="text-lime">In this lesson:</b> we open {open.topics[watching % open.topics.length]} inside a real project, break the prompt down line by line, render three variants, and keep the one with the strongest first-frame hook. Steal the template, remake it with your Soul, ship it today.
              </div>
              <div className="flex gap-2 mt-4">
                <Btn kind="lime" onClick={()=>{ toggleDone(open.id+'-'+(watching % open.topics.length)); toast('Lesson marked complete. Knowledge: compounded.') }}>
                  {done.includes(open.id+'-'+(watching % open.topics.length)) ? <><CheckCircle2 size={15}/> Completed</> : 'Mark complete'}
                </Btn>
                <Link to="/video" onClick={()=>setOpen(null)}><Btn>Practice in the studio <ChevronRight size={14}/></Btn></Link>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Curriculum</p>
              {open.topics.map((t,i)=>(
                <button key={t} onClick={()=>setWatching(i)} className={cx('w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition', watching===i ? 'border-lime bg-lime/8 text-white' : 'border-line bg-panel2 text-zinc-300 hover:border-zinc-500')}>
                  {done.includes(open.id+'-'+i) ? <CheckCircle2 size={15} className="text-lime shrink-0"/> : <Play size={13} className="text-zinc-500 shrink-0"/>}
                  <span className="flex-1">{t}</span><span className="text-[10px] text-zinc-600">{6+i*3}m</span>
                </button>))}
            </div>
          </div>
        </div>}
      </Modal>
    </div>
  )
}
