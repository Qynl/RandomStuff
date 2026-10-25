import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { uid, hash, seedImg, motionById } from '../lib/engine.js'
import { VIDEO_MODELS, IMAGE_MODELS, EFFECTS } from '../data/catalog.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const load = (k, fb) => { try { const v = localStorage.getItem('hf_'+k); return v ? JSON.parse(v) : fb } catch { return fb } }
const save = (k, v) => { try { localStorage.setItem('hf_'+k, JSON.stringify(v)) } catch {} }

const STAGES_VIDEO = ['Parsing prompt & references','Blocking skeletal motion','Solving camera path','Diffusing frames','Temporal consistency pass','Grading & grain','Upscaling output']
const STAGES_IMAGE = ['Parsing prompt','Composing layout','Diffusing latents','Refining details','Color science pass','Upscaling output']

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => load('user', null))
  const [plan, setPlan] = useState(() => load('plan', 'plus-trial'))
  const [credits, setCredits] = useState(() => load('credits', 1200))
  const [assets, setAssets] = useState(() => load('assets', []))
  const [jobs, setJobs] = useState([])
  const [souls, setSouls] = useState(() => load('souls', []))
  const [toasts, setToasts] = useState([])
  const [playerAsset, setPlayerAsset] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [liked, setLiked] = useState(() => load('liked', []))
  const [savedPrompts, setSavedPrompts] = useState(() => load('prompts', []))
  const jobsRef = useRef(jobs); jobsRef.current = jobs

  useEffect(()=>save('user',user),[user]); useEffect(()=>save('plan',plan),[plan])
  useEffect(()=>save('credits',credits),[credits]); useEffect(()=>save('assets',assets.slice(0,120)),[assets])
  useEffect(()=>save('souls',souls),[souls]); useEffect(()=>save('liked',liked),[liked])
  useEffect(()=>save('prompts',savedPrompts),[savedPrompts])

  const toast = useCallback((msg, kind='ok', action) => {
    const id = uid(); setToasts(t=>[...t,{id,msg,kind,action}])
    setTimeout(()=> setToasts(t=>t.filter(x=>x.id!==id)), 4200)
  },[])

  const spend = useCallback((cost) => {
    if (cost<=0) return true
    let ok = false
    setCredits(c => { if (c>=cost){ ok=true; return c-cost } return c })
    return ok || credits >= cost
  },[credits])

  // ── Generation engine ──
  const enqueue = useCallback((spec) => {
    // spec: {type, modelId, prompt, motionId, effectId, filter, overlay, ratio, w,h, duration, res, imageUrl(base), seed, count, label, characterImg}
    const cost = spec.cost ?? 0
    if (credits < cost) { toast(`Not enough credits — this render needs ${cost}. Top up to keep creating.`, 'warn'); return null }
    if (cost) setCredits(c=>c-cost)
    const job = { ...spec, id: uid(), progress: 0, stage: 0, status:'rendering', createdAt: Date.now() }
    setJobs(j=>[...j, job])
    return job.id
  },[credits, toast])

  const landedRef = useRef(new Set())
  useEffect(() => {
    const iv = setInterval(() => {
      setJobs(prev => {
        if (!prev.some(j=>j.status==='rendering')) return prev
        return prev.map(j => {
          if (j.status!=='rendering') return j
          const model = [...VIDEO_MODELS, ...IMAGE_MODELS].find(m=>m.id===j.modelId)
          const speed = (model?.speed ?? 70) / 100
          const inc = (0.55 + Math.random()*1.15) * speed * (j.type==='image' ? 2.1 : 1)
          const progress = Math.min(100, j.progress + inc)
          const stages = j.type==='image' ? STAGES_IMAGE : STAGES_VIDEO
          const stage = Math.min(stages.length-1, Math.floor(progress/100*stages.length))
          return { ...j, progress, stage, status: progress>=100 ? 'done' : 'rendering' }
        })
      })
    }, 140)
    return ()=>clearInterval(iv)
  }, [])

  // land finished jobs into the library exactly once
  useEffect(() => {
    jobs.forEach(j => {
      if (j.status!=='done' || landedRef.current.has(j.id)) return
      landedRef.current.add(j.id)
      const count = j.count || 1
      const made = Array.from({length: count}, (_,i) => {
        const seed = (j.seed || hash(j.prompt||j.id)) + i*7919
        const eff = EFFECTS.find(e=>e.id===j.effectId)
        return {
          id: uid(), type: j.type, prompt: j.prompt, modelId: j.modelId, modelName: j.modelName,
          url: j.characterImg && i===0 && j.type==='image' ? j.characterImg : (j.baseImage && i===0 ? j.baseImage : seedImg('hf'+seed, j.w||960, j.h||640)),
          seed, motionId: j.motionId || eff?.motion || 'slow-push-in', effectId: j.effectId || null,
          filter: j.filter || eff?.filter || 'none', overlay: j.overlay || eff?.overlay || 'none',
          ratio: j.ratio, duration: j.duration, res: j.res, style: j.style, label: j.label,
          character: j.character || null, createdAt: Date.now(), fav: false, source: j.source || 'studio',
        }
      })
      setAssets(a=>[...made, ...a])
      setJobs(prev=>prev.map(x=>x.id===j.id ? {...x, _assetIds: made.map(m=>m.id)} : x))
      toast(`${j.type==='video'?'Video':'Image'} ready — ${j.modelName||''} finished rendering`, 'ok', { label:'View', assetId: made[0].id })
    })
  }, [jobs, toast])

  const cancelJob = (id) => {
    const j = jobsRef.current.find(x=>x.id===id)
    if (j?.status==='rendering' && j.cost) { setCredits(c=>c+j.cost); toast(`Render cancelled — ${j.cost} credits refunded`) }
    setJobs(prev=>prev.map(x=>x.id===id?{...x,status:'cancelled'}:x))
  }
  const dismissJob = (id) => setJobs(j=>j.filter(x=>x.id!==id))
  const toggleFav = (id) => setAssets(a=>a.map(x=>x.id===id?{...x,fav:!x.fav}:x))
  const deleteAsset = (id) => setAssets(a=>a.filter(x=>x.id!==id))
  const toggleLike = (id) => setLiked(l=> l.includes(id) ? l.filter(x=>x!==id) : [...l,id])
  const addAsset = (a) => setAssets(prev=>[{id:uid(), createdAt:Date.now(), fav:false, ...a}, ...prev])
  const savePrompt = (p) => { if(!p?.trim()) return; setSavedPrompts(s=> s.includes(p)? s : [p, ...s].slice(0,40)); toast('Prompt saved to your library') }
  const openPlayer = (asset) => setPlayerAsset(asset)

  const stageLabel = (job) => (job.type==='image' ? STAGES_IMAGE : STAGES_VIDEO)[job.stage] || 'Rendering'

  const value = useMemo(()=>({ user,setUser, plan,setPlan, credits,setCredits, assets,setAssets, jobs, souls,setSouls,
    toasts, toast, enqueue, cancelJob, dismissJob, stageLabel, toggleFav, deleteAsset, addAsset,
    playerAsset, setPlayerAsset, openPlayer, authOpen, setAuthOpen, paletteOpen, setPaletteOpen,
    liked, toggleLike, savedPrompts, savePrompt, spend }),
    [user,plan,credits,assets,jobs,souls,toasts,playerAsset,authOpen,paletteOpen,liked,savedPrompts,enqueue,toast])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export { STAGES_VIDEO, STAGES_IMAGE }
