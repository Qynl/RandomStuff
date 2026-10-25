import React, { useMemo, useState } from 'react'
import { Crown, Check, Coins, Sparkles, X, ShieldCheck, Zap } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Seg, Field, Modal } from '../components/ui.jsx'
import { PLANS, CREDIT_COSTS, VIDEO_MODELS } from '../data/catalog.js'
import { calcCost, seedImg } from '../lib/engine.js'

const PACKS = [ { credits:300, price:12 }, { credits:1000, price:35 }, { credits:3000, price:89 }, { credits:10000, price:249 } ]

export default function Pricing() {
  const { plan, setPlan, credits, setCredits, toast, user, setAuthOpen } = useApp()
  const [annual, setAnnual] = useState(true)
  const [calcModel, setCalcModel] = useState(VIDEO_MODELS[0].id)
  const [calcClips, setCalcClips] = useState(20)
  const [calcDur, setCalcDur] = useState(5)
  const [checkout, setCheckout] = useState(null)
  const m = VIDEO_MODELS.find(x=>x.id===calcModel)
  const need = calcCost(m, calcDur, '1080p', 1) * calcClips
  const bestPlan = useMemo(()=> PLANS.filter(p=>p.id!=='free'&&p.id!=='teams').find(p=>p.credits>=need) || PLANS.find(p=>p.id==='ultra'), [need])

  const buy = (p) => {
    if (!user) { setAuthOpen(true); toast('Sign in first — takes 5 seconds', 'warn'); return }
    setCheckout(p)
  }
  const confirm = () => {
    const p = checkout; setCheckout(null)
    if (p.kind==='pack') { setCredits(c=>c+p.credits); toast(`+${p.credits.toLocaleString()} credits added to your balance`) }
    else { setPlan(p.id); setCredits(c=>c+p.credits); toast(`Welcome to ${p.name} — ${p.credits.toLocaleString()} credits landed in your account`) }
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
      <div className="relative rounded-[28px] overflow-hidden border border-line grain">
        <img src={seedImg('pricing-hero',1600,700)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="relative p-7 sm:p-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lime text-black px-3 py-1 text-[11px] font-extrabold tracking-wider"><Zap size={12}/> SEEDANCE 2.5 SALE — EXTRA DISCOUNT LIVE</span>
          <h1 className="mt-4 text-5xl sm:text-6xl font-black tracking-tight leading-[.95]" style={{fontFamily:'Archivo'}}>Every model.<br/><span className="text-stroke-lime">One subscription.</span></h1>
          <p className="mt-3 text-zinc-300 leading-relaxed">Seedance, Kling, Veo, Sora, Nano Banana — plus Cinema Studio, Soul ID and the Supercomputer. You currently hold <b className="text-lime">{credits.toLocaleString()} credits</b>.</p>
          <div className="mt-5"><Seg options={[{id:'m',label:'Monthly'},{id:'a',label:'Annual · save up to 23%'}]} value={annual?'a':'m'} onChange={v=>setAnnual(v==='a')} /></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3.5 mt-6">
        {PLANS.map(p=>{
          const price = annual ? p.annual : p.monthly
          const current = plan===p.id || (p.id==='plus' && plan==='plus-trial')
          return (
            <div key={p.id} className={cx('relative rounded-3xl border bg-panel p-5 flex flex-col', p.popular ? 'border-lime shadow-[0_0_50px_-12px_#d9ff4a55]' : 'border-line')}>
              {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime text-black text-[10px] font-black rounded-full px-3 py-1 tracking-wider whitespace-nowrap">MOST POPULAR</span>}
              <h3 className="font-black text-lg flex items-center gap-2" style={{fontFamily:'Archivo'}}>{p.name} {p.id==='ultra' && <Crown size={15} className="text-lime"/>}</h3>
              <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">{p.tag}</p>
              <div className="mt-4 flex items-end gap-1"><span className="text-4xl font-black tracking-tight" style={{fontFamily:'Archivo'}}>${price}</span><span className="text-zinc-500 text-sm mb-1">/mo{p.perSeat ? '/seat' : ''}</span></div>
              {annual && p.monthly>p.annual && <p className="text-[11px] text-zinc-500"><s>${p.monthly}</s> billed annually</p>}
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-lime"><Coins size={14}/>{p.credits.toLocaleString()} credits/mo</p>
              <ul className="mt-4 space-y-2 text-[12.5px] text-zinc-300 flex-1">{p.features.map(f=><li key={f} className="flex gap-2 leading-snug"><Check size={14} className="text-lime shrink-0 mt-0.5"/>{f}</li>)}</ul>
              <Btn kind={p.popular ? 'lime' : 'ghost'} className="w-full mt-5" disabled={current} onClick={()=>buy({kind:'plan', ...p, price})}>{current ? (plan==='plus-trial'&&p.id==='plus' ? 'Your trial plan' : 'Current plan') : p.cta}</Btn>
            </div>
          )})}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <div className="rounded-3xl border border-line bg-panel p-6">
          <h3 className="font-extrabold flex items-center gap-2"><Coins size={16} className="text-lime"/> Top-up packs <span className="text-[11px] text-zinc-500 font-semibold">never expire on paid plans</span></h3>
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            {PACKS.map(p=>(
              <button key={p.credits} onClick={()=>buy({kind:'pack', name:`${p.credits.toLocaleString()} credit pack`, ...p})} className="rounded-2xl border border-line bg-panel2 hover:border-lime/60 p-4 text-left transition group">
                <b className="text-lg">{p.credits.toLocaleString()}</b><span className="text-zinc-500 text-sm"> credits</span>
                <p className="text-lime font-extrabold mt-0.5">${p.price} <span className="text-zinc-500 font-semibold text-[11px]">· ${(p.price/p.credits*100).toFixed(1)}¢/credit</span></p>
              </button>))}
          </div>
          <h4 className="font-bold text-sm mt-6 mb-2.5">What credits buy</h4>
          <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1.5 text-[12.5px]">{CREDIT_COSTS.map(([k,v])=>(<div key={k} className="flex justify-between border-b border-line/60 pb-1.5"><span className="text-zinc-400">{k}</span><b>{v}</b></div>))}</div>
        </div>

        <div className="rounded-3xl border border-line bg-panel p-6">
          <h3 className="font-extrabold flex items-center gap-2"><Sparkles size={16} className="text-lime"/> Credit calculator</h3>
          <p className="text-[12px] text-zinc-500 mt-1">Tell us your output. We’ll point at the right plan — honestly.</p>
          <div className="mt-4"><Field label="Model"><select value={calcModel} onChange={e=>setCalcModel(e.target.value)} className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm font-semibold">
            {VIDEO_MODELS.map(x=><option key={x.id} value={x.id}>{x.name} · {x.credits}cr/{x.unit}</option>)}
          </select></Field></div>
          <Field label={`Clips per month · ${calcClips}`}><input type="range" min={1} max={300} value={calcClips} onChange={e=>setCalcClips(+e.target.value)} className="w-full" /></Field>
          <Field label={`Seconds per clip · ${calcDur}s`}><input type="range" min={3} max={15} value={calcDur} onChange={e=>setCalcDur(+e.target.value)} className="w-full" /></Field>
          <div className="rounded-2xl bg-lime/8 border border-lime/30 p-4 mt-2">
            <p className="text-sm">You’d burn <b className="text-lime text-lg">{need.toLocaleString()}</b> credits/month.</p>
            <p className="text-[12px] text-zinc-400 mt-1">Best fit: <b className="text-white">{bestPlan.name}</b> — {bestPlan.credits.toLocaleString()} credits for ${annual?bestPlan.annual:bestPlan.monthly}/mo{bestPlan.credits<need ? ' + top-up packs for the overflow' : ''}.</p>
            <Btn kind="lime" className="mt-3 !py-2" onClick={()=>buy({kind:'plan', ...bestPlan, price: annual?bestPlan.annual:bestPlan.monthly})}>Get {bestPlan.name}</Btn>
          </div>
          <div className="mt-5 space-y-2.5">
            {[['Do credits roll over?','Plan credits refresh monthly and don’t roll over; top-up pack credits never expire while subscribed.'],['What does “Unlimited” mean?','Time-boxed unlimited windows on named models (e.g. 7 days of Kling 3.0 on Plus) plus a 365-day unlimited video model on Ultra.'],['Can I use outputs commercially?','Yes — commercial rights included on every paid plan, with indemnification on Teams.'],['Is my data trained on?','Never on Teams; opt-out available on all paid plans. SOC 2 audited.']].map(([q,a])=>(
              <details key={q} className="rounded-2xl bg-panel2 border border-line px-4 py-3"><summary className="text-sm font-bold flex justify-between">{q}<span className="text-lime">+</span></summary><p className="text-[12.5px] text-zinc-400 mt-2 leading-relaxed">{a}</p></details>
            ))}
          </div>
        </div>
      </div>

      <Modal open={!!checkout} onClose={()=>setCheckout(null)}>
        {checkout && <div className="p-7">
          <div className="flex items-center gap-2 text-lime font-extrabold text-[12px] tracking-wider"><ShieldCheck size={15}/> SECURE CHECKOUT</div>
          <h3 className="text-2xl font-black mt-3" style={{fontFamily:'Archivo'}}>{checkout.name}</h3>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-400">{checkout.kind==='pack' ? 'Credit pack (one-time)' : `Subscription · ${annual?'annual billing':'monthly'}`}</span><b>${checkout.price}{checkout.kind==='plan'?'/mo':''}</b></div>
            <div className="flex justify-between"><span className="text-zinc-400">Credits granted instantly</span><b className="text-lime">+{checkout.credits.toLocaleString()}</b></div>
            <div className="flex justify-between"><span className="text-zinc-400">Seedance 2.5 sale bonus</span><b className="text-lime">applied</b></div>
            <div className="border-t border-line pt-2 flex justify-between text-base"><span>Total today</span><b>${checkout.price}</b></div>
          </div>
          <div className="mt-5 space-y-2">
            <input placeholder="Card number · 4242 4242 4242 4242" className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm placeholder:text-zinc-600" />
            <div className="grid grid-cols-2 gap-2"><input placeholder="MM / YY" className="rounded-xl bg-panel2 border border-line px-4 py-3 text-sm placeholder:text-zinc-600" /><input placeholder="CVC" className="rounded-xl bg-panel2 border border-line px-4 py-3 text-sm placeholder:text-zinc-600" /></div>
          </div>
          <Btn kind="lime" className="w-full mt-5 !py-3.5" onClick={confirm}>Pay ${checkout.price} & activate</Btn>
          <p className="text-[11px] text-zinc-600 text-center mt-3">Demo checkout — no real card is charged. Credits are granted locally.</p>
        </div>}
      </Modal>
    </div>
  )
}
