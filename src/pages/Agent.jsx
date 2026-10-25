import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Send, Sparkles, Film, Image as ImageIcon, Loader2, Play, Bot, User } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx } from '../components/ui.jsx'
import { VIDEO_MODELS, IMAGE_MODELS, CAMERA_PRESETS, EFFECTS } from '../data/catalog.js'
import { enhancePrompt, seedImg, calcCost, hash } from '../lib/engine.js'

const SUGGESTIONS = [
  'Make a video of a neon samurai in rainy Tokyo with bullet time',
  'Generate an image of a perfume ad on a marble pedestal at golden hour',
  'What’s the best model for cinematic camera moves?',
  'Make 4 images of a cyberpunk geisha portrait series',
  'Create a video of a whale swimming through clouds, crane reveal',
  'How many credits does Sora 2 cost?',
]

function agentBrain(text, ctx) {
  const t = text.toLowerCase()
  const wantImage = /(image|photo|picture|poster|still|portrait|draw|illustrat)/.test(t)
  const wantVideo = /(video|film|clip|animate|movie|shot|scene)/.test(t)
  const countMatch = t.match(/\b([2-8])\b/)
  const count = countMatch ? +countMatch[1] : 1
  const cam = CAMERA_PRESETS.find(c => t.includes(c.name.toLowerCase().split('(')[0].trim()) || (c.id.includes('bullet') && t.includes('bullet time')) || (c.id.includes('crane-up') && t.includes('crane')) || (c.id==='earth-zoom-out' && t.includes('earth zoom')) || (c.id==='orbit' || c.id==='360-orbit') && t.includes('orbit'))
  const effect = EFFECTS.find(e => t.includes(e.name.toLowerCase()))
  const vModel = VIDEO_MODELS.find(m => t.includes(m.name.toLowerCase())) || VIDEO_MODELS[0]
  const iModel = IMAGE_MODELS.find(m => t.includes(m.name.toLowerCase())) || IMAGE_MODELS[0]
  let subject = text.replace(/^(please\s+)?(make|create|generate|render|draw|give me|i want|can you make)\s+(me\s+)?(an?\s+)?(\d+\s+)?(videos?|images?|photos?|pictures?|clips?|films?|shots?|scenes?)?\s*(of|about|showing)?\s*/i,'').trim()
  if (subject.length < 3) subject = text

  if (/price|pricing|cost|plan|credit/.test(t) && !wantVideo && !wantImage) {
    const m = [...VIDEO_MODELS, ...IMAGE_MODELS].find(x=>t.includes(x.name.toLowerCase()))
    if (m) return { text: `**${m.name}** runs **${m.credits} credits${m.unit ? ' per '+m.unit : ' per image'}**${m.unit ? ` (~${calcCost(m,5,'1080p')} credits for a 5s 1080p clip)` : ''}. You currently have **${ctx.credits.toLocaleString()} credits**. Want me to queue a test render?` }
    return { text: `Plans: **Starter $19** (270cr), **Plus $47/yr-billing** (1,200cr), **Ultra $99** (3,000cr+). You have **${ctx.credits.toLocaleString()} credits** right now. Head to Pricing for the full matrix — or just tell me what to make and I’ll spend them wisely.` }
  }
  if (/best model|which model|recommend/.test(t)) {
    if (/camera|cinematic|dop/.test(t)) return { text: `For director-level camera language, use **Higgsfield DoP Turbo** (70+ presets) or **Cinema Studio** with Seedance 2.5. DoP is faster and cheaper (7cr/5s); Cinema Studio gives you real bodies, lenses and shot lists. Tell me a scene and I’ll direct it.` }
    if (/image|photo/.test(t)) return { text: `For images: **Nano Banana Pro** for edits & text, **Soul V2** for consistent characters, **FLUX.2 Pro** for reference-driven work. Give me a subject and I’ll pick automatically.` }
    return { text: `My current podium: **Seedance 2.5** (overall), **Kling 4.0** (editing with references), **Sora 2** (long coherent takes), **Genjutsu** (recasting motion). What are we making?` }
  }
  if (/^(hi|hello|hey|yo)\b/.test(t)) return { text: `Hey. I’m the Supercomputer — part director, part render farm. Describe any video or image and I’ll choose the model, camera move and grade, then actually render it into your Library.` }
  if (wantImage && !wantVideo) {
    return { text: `On it — routing to **${iModel.name}**. Enhancing your prompt with editorial direction and generating ${count>1?count+' variations':'1 image'} now.`,
      action: { type:'image', model:iModel, prompt: enhancePrompt(subject,'image'), count } }
  }
  if (wantVideo || /make|create|generate/.test(t)) {
    return { text: `Directing it now with **${vModel.name}**${cam?` · camera: **${cam.name}**`:''}${effect?` · effect: **${effect.name}**`:''}. I’ve enhanced the prompt with lensing and performance notes. Rendering into your Library…`,
      action: { type:'video', model:vModel, prompt: enhancePrompt(subject,'video'), motionId: cam?.id || effect?.motion, effectId: effect?.id, count } }
  }
  return { text: `I can render that. Say it like “make a video of …” or “generate an image of …” and I’ll pick the model, camera and grade myself. I also answer model/pricing questions. Current balance: **${ctx.credits.toLocaleString()} credits**.` }
}

export default function Agent() {
  const { enqueue, credits, jobs, assets, openPlayer, toast } = useApp()
  const nav = useNavigate()
  const [msgs, setMsgs] = useState(()=>{ try { return JSON.parse(localStorage.getItem('hf_agent')||'null') } catch { return null } })
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottom = useRef(null)
  useEffect(()=>{ if (!msgs) setMsgs([{ role:'bot', text:'Welcome to the **Supercomputer** — an agent powered by GPT-6 Astra with direct access to every Higgsfield model. Describe a video or image. I’ll direct, enhance and render it for real.' }]) },[])
  useEffect(()=>{ if (msgs) localStorage.setItem('hf_agent', JSON.stringify(msgs.slice(-40))) },[msgs])
  useEffect(()=>{ bottom.current?.scrollIntoView({ behavior:'smooth' }) },[msgs, typing])
  if (!msgs) return null

  const send = (preset) => {
    const text = (preset || input).trim(); if (!text || typing) return
    setInput(''); setMsgs(m=>[...m, { role:'user', text }]); setTyping(true)
    setTimeout(()=>{
      const reply = agentBrain(text, { credits })
      let jobId = null
      if (reply.action) {
        const a = reply.action
        if (a.type==='video') jobId = enqueue({ type:'video', modelId:a.model.id, modelName:a.model.name, prompt:a.prompt, motionId:a.motionId, effectId:a.effectId, filter: EFFECTS.find(e=>e.id===a.effectId)?.filter, overlay: EFFECTS.find(e=>e.id===a.effectId)?.overlay, ratio:'16:9', w:1280, h:720, duration:5, res:'1080p', count:a.count, cost: calcCost(a.model,5,'1080p',a.count), seed: hash(a.prompt), source:'supercomputer' })
        else jobId = enqueue({ type:'image', modelId:a.model.id, modelName:a.model.name, prompt:a.prompt, ratio:'16:9', w:1344, h:768, count:a.count, cost: a.model.credits*a.count, seed: hash(a.prompt), source:'supercomputer' })
        if (!jobId) reply.text += '\n\n⚠ But you don’t have enough credits for that render — top up in Pricing and ask again.'
      }
      setMsgs(m=>[...m, { role:'bot', text: reply.text, jobId }]); setTyping(false)
    }, 750 + Math.random()*650)
  }

  const jobAsset = (jobId) => { const j = jobs.find(x=>x.id===jobId); return j?._assetIds?.map(id=>assets.find(a=>a.id===id)).filter(Boolean) || [] }
  const jobProgress = (jobId) => jobs.find(x=>x.id===jobId)
  const md = (s) => s.split('**').map((p,i)=> i%2 ? <b key={i} className="text-lime font-bold">{p}</b> : p)

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] max-w-4xl mx-auto w-full px-3 sm:px-5">
      <header className="flex items-center gap-3 py-5">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><Cpu size={21}/></span>
        <div className="flex-1"><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>SUPERCOMPUTER</h1>
        <p className="text-[12px] text-zinc-500">Agent powered by GPT-6 Astra · connected to all 23 models · renders for real</p></div>
        <button onClick={()=>{ setMsgs([{role:'bot',text:'Fresh session. What are we rendering?'}]); }} className="text-[12px] font-bold text-zinc-400 hover:text-white border border-line rounded-full px-3 py-1.5">New chat</button>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
        {msgs.map((m,i)=>(
          <div key={i} className={cx('flex gap-3', m.role==='user' && 'flex-row-reverse')}>
            <span className={cx('h-8 w-8 rounded-full grid place-items-center shrink-0 mt-0.5', m.role==='user' ? 'bg-white text-black' : 'bg-panel3 border border-line text-lime')}>{m.role==='user' ? <User size={14}/> : <Bot size={15}/>}</span>
            <div className={cx('max-w-[82%] rounded-3xl px-4 py-3 text-[14px] leading-relaxed', m.role==='user' ? 'bg-lime text-black font-medium rounded-tr-lg' : 'bg-panel2 border border-line rounded-tl-lg')}>
              {m.role==='user' ? m.text : md(m.text)}
              {m.jobId && (()=>{
                const done = jobAsset(m.jobId); const j = jobProgress(m.jobId)
                if (done.length) return <div className="flex gap-2 mt-3 flex-wrap">{done.map(a=>(
                  <button key={a.id} onClick={()=>openPlayer(a)} className="relative rounded-2xl overflow-hidden border border-line group w-[150px]">
                    <img src={a.url} alt="" className="h-[92px] w-full object-cover group-hover:scale-105 transition" style={{filter:a.filter!=='none'?a.filter:undefined}} />
                    <span className="absolute inset-0 grid place-items-center bg-black/25"><span className="h-8 w-8 grid place-items-center rounded-full bg-lime text-black"><Play size={13} className="ml-0.5"/></span></span>
                  </button>))}<button onClick={()=>nav('/library')} className="text-[12px] font-bold text-lime hover:underline self-center">Open in Library →</button></div>
                if (j?.status==='rendering') return <div className="mt-3 rounded-2xl bg-black/30 border border-line p-3 flex items-center gap-2.5 text-[12px] font-semibold"><Loader2 size={14} className="animate-spin text-lime"/> Rendering on {j.modelName} — {Math.round(j.progress)}%</div>
                return null
              })()}
            </div>
          </div>
        ))}
        {typing && <div className="flex gap-3"><span className="h-8 w-8 rounded-full grid place-items-center bg-panel3 border border-line text-lime"><Bot size={15}/></span><div className="bg-panel2 border border-line rounded-3xl rounded-tl-lg px-4 py-3.5 flex gap-1.5">{[0,1,2].map(i=><span key={i} className="h-2 w-2 rounded-full bg-lime" style={{animation:`pulse-dot 1s ${i*.18}s infinite`}} />)}</div></div>}
        <div ref={bottom} />
      </div>

      <div className="pb-5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2.5">{SUGGESTIONS.map(s=><button key={s} onClick={()=>send(s)} className="shrink-0 text-[12px] font-semibold rounded-full bg-panel2 border border-line px-3.5 py-2 text-zinc-300 hover:border-lime/60 hover:text-white transition">{s}</button>)}</div>
        <form onSubmit={e=>{e.preventDefault(); send()}} className="flex items-center gap-2 rounded-full bg-panel2 border border-line p-1.5 pl-5 focus-within:border-lime/50 transition">
          <Sparkles size={17} className="text-lime shrink-0" />
          <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Tell the Supercomputer what to create…" className="flex-1 bg-transparent text-sm sm:text-[15px] placeholder:text-zinc-600 border-none min-w-0" />
          <button disabled={!input.trim()} className="h-10 w-10 grid place-items-center rounded-full bg-lime text-black hover:bg-[#eaff85] disabled:opacity-35 transition shrink-0"><Send size={16}/></button>
        </form>
        <p className="text-[11px] text-zinc-600 text-center mt-2">The agent spends real credits from your balance ({credits.toLocaleString()} available) and saves every render to your Library.</p>
      </div>
    </div>
  )
}
