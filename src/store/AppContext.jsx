import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { uid, hash, seedImg, motionById } from '../lib/engine.js'
import { VIDEO_MODELS, IMAGE_MODELS, EFFECTS } from '../data/catalog.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const load = (k, fb) => { try { const v = localStorage.getItem('hf_'+k); return v ? JSON.parse(v) : fb } catch { return fb } }
const save = (k, v) => { try { localStorage.setItem('hf_'+k, JSON.stringify(v)) } catch {} }
// quota-safe asset persistence (real AI images can be large data URLs)
const saveAssets = (list) => {
  for (const n of [120, 60, 30, 12, 4]) {
    try { localStorage.setItem('hf_assets', JSON.stringify(list.slice(0, n))); return } catch {}
  }
}

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
  // ── BYOK live-AI state ──
  const [liveMode, setLiveMode] = useState(() => load('liveMode', false))
  const [keys, setKeys] = useState(() => load('keys', {}))
  const [providerPrefs, setProviderPrefs] = useState(() => load('providerPrefs', { image:'fal', llm:'openrouter' }))
  const [spendCap, setSpendCap] = useState(() => load('spendCap', 50))
  const [ledger, setLedger] = useState(() => load('ledger', []))
  const jobsRef = useRef(jobs); jobsRef.current = jobs
  const keysRef = useRef(keys); keysRef.current = keys
  const prefsRef = useRef(providerPrefs); prefsRef.current = providerPrefs

  useEffect(()=>save('user',user),[user]); useEffect(()=>save('plan',plan),[plan])
  useEffect(()=>save('credits',credits),[credits]); useEffect(()=>saveAssets(assets),[assets])
  useEffect(()=>save('souls',souls),[souls]); useEffect(()=>save('liked',liked),[liked])
  useEffect(()=>save('prompts',savedPrompts),[savedPrompts])
  useEffect(()=>save('liveMode',liveMode),[liveMode]); useEffect(()=>save('keys',keys),[keys])
  useEffect(()=>save('providerPrefs',providerPrefs),[providerPrefs])
  useEffect(()=>save('spendCap',spendCap),[spendCap]); useEffect(()=>save('ledger',ledger.slice(0,300)),[ledger])

  const monthSpend = useCallback(() => {
    const m = new Date().toISOString().slice(0,7)
    return ledger.filter(l=> new Date(l.ts).toISOString().slice(0,7)===m).reduce((a,l)=>a+(l.usd||0),0)
  }, [ledger])

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

  // ── Live (BYOK) runner: real provider calls, billed to the user's account ──
  const runLiveJob = useCallback(async (job, route) => {
    const upd = (progress, stageText) => setJobs(prev=>prev.map(x=>x.id===job.id ? {...x, progress, stageText} : x))
    try {
      const results = await generateLive(job, route, keysRef.current, upd)
      const eff = EFFECTS.find(e=>e.id===job.effectId)
      const made = results.map((r,i)=>({
        id: uid(), type: job.type, prompt: job.prompt, modelId: job.modelId,
        modelName: `${job.modelName} · ${route.providerName}`,
        url: r.url, videoUrl: r.videoUrl || null, real: true, provider: route.providerName, endpoint: r.endpoint, costUSD: r.usd,
        seed: (job.seed||0)+i, motionId: job.motionId || eff?.motion || 'slow-push-in', effectId: job.effectId || null,
        filter: r.videoUrl ? 'none' : (job.filter || eff?.filter || 'none'), overlay: r.videoUrl ? 'none' : (job.overlay || eff?.overlay || 'none'),
        ratio: job.ratio, duration: job.duration, res: job.res, style: job.style, label: job.label,
        character: job.character || null, createdAt: Date.now(), fav: false, source: job.source || 'studio',
      }))
      setAssets(a=>[...made, ...a])
      setLedger(l=>[...made.map(m=>({ ts: Date.now(), provider: route.providerName, model: m.modelName, type: m.type, usd: m.costUSD||0 })), ...l])
      setJobs(prev=>prev.map(x=>x.id===job.id ? {...x, status:'done', progress:100, _assetIds: made.map(m=>m.id)} : x))
      toast(`Real AI ${job.type==='video'?'video':'image'} ready — generated on your ${route.providerName} account (~${money(made.reduce((a,m)=>a+(m.costUSD||0),0))} est.)`, 'ok', { label:'View', assetId: made[0].id })
    } catch (err) {
      setJobs(prev=>prev.map(x=>x.id===job.id ? {...x, status:'error', error: err.message} : x))
      toast(`Live generation failed: ${err.message}`, 'warn')
    }
  }, [toast])

  // ── Generation engine ──
  const enqueue = useCallback((spec) => {
    // spec: {type, modelId, prompt, motionId, effectId, filter, overlay, ratio, w,h, duration, res, imageUrl(base), seed, count, label, characterImg}
    if (liveMode) {
      const route = resolveRoute(spec, keysRef.current, prefsRef.current)
      if (!route) {
        toast(spec.type==='video'
          ? 'Live video needs a fal.ai key — connect one in Settings → AI Providers (you pay fal directly, ~cents per clip). Or switch to Demo in the top bar.'
          : 'Live mode needs a connected provider key — add one in Settings → AI Providers. Or switch to Demo in the top bar.', 'warn')
        return null
      }
      const est = estimateLive(spec, keysRef.current, prefsRef.current)
      if (spendCap > 0 && monthSpend() + (est?.usd||0) > spendCap) {
        toast(`Spend guard: this would pass your $${spendCap}/mo cap (est. ${money(monthSpend())} spent). Raise it in Settings → AI Providers.`, 'warn')
        return null
      }
      const job = { ...spec, id: uid(), progress: 2, stage: 0, status:'rendering', createdAt: Date.now(), mode:'live', providerName: route.providerName, endpoint: route.endpoint, estUSD: est?.usd, cost: 0, stageText:`Contacting ${route.providerName}…` }
      setJobs(j=>[...j, job])
      runLiveJob(job, route)
      return job.id
    }
    const cost = spec.cost ?? 0
    if (credits < cost) { toast(`Not enough credits — this render needs ${cost}. Top up to keep creating.`, 'warn'); return null }
    if (cost) setCredits(c=>c-cost)
    const job = { ...spec, id: uid(), progress: 0, stage: 0, status:'rendering', createdAt: Date.now() }
    setJobs(j=>[...j, job])
    return job.id
  },[credits, toast, liveMode, runLiveJob, spendCap, monthSpend])

  const landedRef = useRef(new Set())
  useEffect(() => {
    const iv = setInterval(() => {
      setJobs(prev => {
        if (!prev.some(j=>j.status==='rendering')) return prev
        return prev.map(j => {
          if (j.status!=='rendering' || j.mode==='live') return j
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
      if (j.status!=='done' || j.mode==='live' || landedRef.current.has(j.id)) return
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

  const stageLabel = (job) => job.stageText || (job.type==='image' ? STAGES_IMAGE : STAGES_VIDEO)[job.stage] || 'Rendering'
  const liveEstimate = useCallback((spec) => estimateLive(spec, keysRef.current, prefsRef.current), [])
  const askLLM = useCallback(async (messages) => { try { return await llmChat(messages, keysRef.current, prefsRef.current) } catch { return null } }, [])

  const value = useMemo(()=>({ user,setUser, plan,setPlan, credits,setCredits, assets,setAssets, jobs, souls,setSouls,
    toasts, toast, enqueue, cancelJob, dismissJob, stageLabel, toggleFav, deleteAsset, addAsset,
    playerAsset, setPlayerAsset, openPlayer, authOpen, setAuthOpen, paletteOpen, setPaletteOpen,
    liked, toggleLike, savedPrompts, savePrompt, spend,
    liveMode, setLiveMode, keys, setKeys, providerPrefs, setProviderPrefs, spendCap, setSpendCap, ledger, setLedger, monthSpend, liveEstimate, askLLM }),
    [user,plan,credits,assets,jobs,souls,toasts,playerAsset,authOpen,paletteOpen,liked,savedPrompts,enqueue,toast,liveMode,keys,providerPrefs,spendCap,ledger,monthSpend,liveEstimate,askLLM])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export { STAGES_VIDEO, STAGES_IMAGE }
