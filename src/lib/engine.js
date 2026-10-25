// ─── MotionEngine + generation brain + real WebM video export ───
import { CAMERA_PRESETS } from '../data/catalog.js'

export const hash = (s='') => { let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0 } return Math.abs(h) }
export const seedImg = (seed, w=960, h=640) => `https://picsum.photos/seed/${encodeURIComponent(String(seed))}/${w}/${h}`
export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4)
export const fmtTime = (ts) => new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}) + ' · ' + new Date(ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})

export const motionById = (id) => CAMERA_PRESETS.find(c=>c.id===id) || CAMERA_PRESETS[1]

const EASE = {
  linear: t=>t, inout: t=> t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2,
  in: t=> t*t*t, out: t=> 1-Math.pow(1-t,3),
  snap: t=> t<.55 ? Math.pow(t/.55,3)*.92 : .92 + (1-Math.pow(1-(t-.55)/.45,2))*.08,
  bullet: t=> t<.3 ? (t/.3)*.25 : t<.7 ? .25+((t-.3)/.4)*.08 : .33+((t-.7)/.3)*.67,
  ramp: t=> t<.4 ? (t/.4)*.15 : .15+Math.pow((t-.4)/.6,2.2)*.85,
}
// returns {scale,x%,y%,rot deg, blur px} for progress t (0..1), loops via ping-pong handled by caller
export function motionAt(motion, rawT, timeMs=0) {
  const m = motion || {}
  let t = (EASE[m.ease] || EASE.inout)(Math.min(1, Math.max(0, rawT)))
  if (m.pulse) t = Math.min(1, t + Math.sin(rawT*Math.PI*m.pulse)*0.06)
  const lerp = (a,b)=> a+(b-a)*t
  let scale = lerp(m.s0??1.15, m.s1??1.35)
  let x = lerp(m.x0??0, m.x1??0), y = lerp(m.y0??0, m.y1??0), rot = lerp(m.r0??0, m.r1??0)
  if (m.orbit) { const a = rawT * Math.PI*2*m.orbit; x += Math.sin(a)*6; y += Math.cos(a)*1.6; scale *= 1 + Math.sin(a*2)*.03 }
  if (m.warp) scale *= 1 + Math.sin(t*Math.PI)*.06*m.warp
  if (m.bob) y += Math.sin(timeMs/280*m.bob)*.9
  if (m.shake) { x += (Math.sin(timeMs/47)+Math.sin(timeMs/31)*.6)*.45*m.shake; y += (Math.cos(timeMs/53)+Math.sin(timeMs/29)*.6)*.4*m.shake; rot += Math.sin(timeMs/61)*.5*m.shake }
  const blur = m.blur ? Math.sin(rawT*Math.PI)*7 : 0
  return { scale, x, y, rot, blur }
}
export const pingpong = (t) => { const c = t % 2; return c < 1 ? c : 2 - c }

// ─── Prompt brain ───
const CINE = ['shot on ARRI Alexa 65','anamorphic lens flare','volumetric god rays','shallow depth of field','practical lighting','film grain, halation','chiaroscuro contrast','teal-and-orange grade','atmospheric haze','65mm cinematography']
const PERFORM = ['micro-expressions, breathing life','weight and momentum in every movement','fabric physics, wind interaction','eye-line locked to camera','subsurface skin scattering']
export function enhancePrompt(p, mode='video') {
  const base = (p||'').trim().replace(/\.*$/,'')
  if (!base) return base
  const h = hash(base)
  const pick = (arr,n)=> { const out=[]; for(let i=0;i<n;i++) out.push(arr[(h>> (i*3)) % arr.length]); return [...new Set(out)] }
  const tail = mode==='video'
    ? [...pick(CINE,3), ...pick(PERFORM,2), 'continuous unbroken take', 'photorealistic motion, 24fps']
    : [...pick(CINE,2), 'ultra-detailed, 8k', 'editorial composition, rule of thirds', 'award-winning photography']
  return `${base} — ${tail.join(', ')}`
}

export function calcCost(model, duration=5, res='1080p', count=1) {
  if (!model) return 0
  const perUnit = model.unit ? parseInt(model.unit) : 5
  const units = Math.max(1, Math.ceil(duration / perUnit))
  const resMult = res==='4K' ? 2.2 : res==='1080p' ? 1.4 : 1
  return Math.ceil(model.credits * units * resMult) * count
}

// Mr. Higgs shot breakdown
const SHOT_TEMPLATES = {
  General: [['Establishing Wide','crane-up-reveal','Open on the world. Set geography, mood and scale before we meet anyone.'],['Character Introduction','slow-push-in','Push toward our subject. Let the audience read their face and intention.'],['Action Beat','gimbal-chase','The inciting movement — energy enters the frame, stakes become physical.'],['Emotional Close-Up','anamorphic-breathing','Hold on the reaction. Micro-expressions carry the turn of the scene.'],['Climax Hero Shot','hero-low-angle-arc','Low, mythic angle. The moment the poster would freeze.'],['Resolution Pull-Back','crane-up-reveal','Rise away. The world continues; the story lands.']],
  Action: [['Cold Open Impact','crash-zoom-in','Smash into motion mid-beat. No warm-up, pure velocity.'],['Chase Tracking','fpv-dive','FPV pursuit through the environment, obstacles whipping past.'],['Combat Orbit','bullet-time','Time dilates around the decisive strike.'],['Explosion Bayhem','bayhem-spin','Low spinning hero shot as the world erupts behind them.'],['Escape Crane','crane-up-reveal','Pull up and out as they break free into open space.']],
  Horror: [['Dread Establishing','kubrick-one-point','Symmetric, too-quiet wide. Something is wrong with the stillness.'],['Creeping Push','dolly-in','Inexorable slow push toward the darkness at frame edge.'],['False Scare Whip','whip-pan-left','Whip to nothing. The scare is the absence.'],['Snorri Panic','snorricam','Face locked, world lurching — terror in first person.'],['Final Reveal','crash-zoom-in','Snap zoom onto what was behind them all along.']],
  Comedy: [['Deadpan Wide','static-shot','Locked-off wide. Let the absurdity play in real time.'],['Punch-In Reaction','digital-punch-in','Hard punch on the double-take. Hold two beats too long.'],['Chaos Whip Series','whip-pan-right','Whip between escalating disasters.'],['Awkward Slow Zoom','slow-push-in','The slowest zoom in cinema history. It just keeps going.'],['Tag Button','crash-zoom-out','Yank out to reveal the bigger joke framing everything.']],
  Noir: [['Rain Alley Wide','slow-pan','Neon bleeding through rain. The city is the antagonist.'],['Venetian Close-Up','anamorphic-breathing','Shadow stripes across the face. Half truth, half lie.'],['Corridor One-Point','kubrick-one-point','Symmetric dread, footsteps echoing toward camera.'],['Mirror Push','mirror-push-through','Through the reflection into the other life they could have had.']],
  Epic: [['World Reveal','earth-zoom-out','From a single face to the fate of nations in one move.'],['Army Drone Pass','drone-flyover','Skim the assembled host, banners snapping in wind.'],['Hero Low Arc','hero-low-angle-arc','The legend assembles themselves for history.'],['Clash Bullet Time','bullet-time','Suspended steel and sparks around the decisive blow.'],['Sunset Crane Finale','crane-up-reveal','Ascend into myth as the score swells.']],
}
export function shotBreakdown(story, genre='General', focal=35) {
  const tpl = SHOT_TEMPLATES[genre] || SHOT_TEMPLATES.General
  const beats = story ? story.split(/[.!?]\s+/).filter(s=>s.trim().length>3) : []
  return tpl.map(([name, motion, desc], i) => ({
    id: uid(), n: i+1, name, motionId: motion, duration: 3 + ((hash(story+name) % 3)),
    prompt: beats[i] ? beats[i].trim() : `${desc} (${story?.slice(0,60) || 'untitled scene'}…)`,
    direction: desc, focal: [24,35,50,85,35,24][i % 6] || focal, status: 'idle', seed: `${hash(story+name+i)}`,
  }))
}

// ─── Canvas video export: renders motion + grade to a REAL .webm ───
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=rej; i.src=src })
}
function drawCover(ctx, img, W, H, tr, filter) {
  ctx.save(); ctx.filter = filter || 'none'
  ctx.translate(W/2, H/2); ctx.rotate((tr.rot||0)*Math.PI/180); ctx.scale(tr.scale, tr.scale)
  ctx.translate((tr.x/100)*W, (tr.y/100)*H)
  const s = Math.max(W/img.width, H/img.height)
  ctx.drawImage(img, -img.width*s/2, -img.height*s/2, img.width*s, img.height*s)
  ctx.restore()
}
function drawOverlayFx(ctx, W, H, overlay, t, timeMs, parts) {
  if (!overlay || overlay==='none') return
  ctx.save()
  if (overlay==='rain' || overlay==='snow') {
    ctx.strokeStyle = overlay==='rain' ? 'rgba(180,200,255,.5)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = overlay==='rain'?1.4:2
    parts.forEach(p=>{ p.y += p.v; p.x += overlay==='snow'? Math.sin(timeMs/500+p.p)*.5 : p.v*.18; if(p.y>H){p.y=-10;p.x=Math.random()*W}
      ctx.beginPath(); if(overlay==='rain'){ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-3,p.y+14)} else {ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,1.8,0,7)} ctx.stroke() })
  }
  if (overlay==='money' || overlay==='confetti') {
    parts.forEach(p=>{ p.y+=p.v; p.x+=Math.sin(timeMs/300+p.p)*1.4; p.r+=p.vr; if(p.y>H+30){p.y=-30;p.x=Math.random()*W}
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle = overlay==='money' ? '#7ed957' : p.c; ctx.fillRect(-16,-8,32,16)
      if(overlay==='money'){ctx.fillStyle='#14532d';ctx.font='bold 10px sans-serif';ctx.fillText('$',-3,4)} ctx.restore() })
  }
  if (overlay==='sparks' || overlay==='dust' || overlay==='bubbles' || overlay==='fire') {
    parts.forEach(p=>{ p.y -= p.v; p.x += Math.sin(timeMs/400+p.p); if(p.y<-10){p.y=H+10;p.x=Math.random()*W}
      ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,7)
      ctx.fillStyle = overlay==='fire' ? `rgba(255,${120+Math.random()*100|0},30,.8)` : overlay==='bubbles' ? 'rgba(190,230,255,.55)' : overlay==='dust' ? 'rgba(255,220,160,.5)' : 'rgba(255,240,180,.9)'; ctx.fill() })
  }
  if (overlay==='explosion' || overlay==='impact') {
    const boom = t<.5 ? t*2 : 1-(t-.5)*2
    const g = ctx.createRadialGradient(W/2,H*.62,0,W/2,H*.62,W*.55*boom+10)
    g.addColorStop(0,`rgba(255,240,200,${.85*boom})`); g.addColorStop(.4,`rgba(255,140,30,${.55*boom})`); g.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H)
  }
  if (overlay==='lightning' && Math.random()<.06) { ctx.fillStyle='rgba(230,240,255,.55)'; ctx.fillRect(0,0,W,H) }
  if (overlay==='glitch') { for(let i=0;i<5;i++){ if(Math.random()<.4){ const y=Math.random()*H; ctx.fillStyle=`rgba(${Math.random()<.5?'217,255,74':'255,0,72'},.25)`; ctx.fillRect(0,y,W,3+Math.random()*10) } } }
  if (overlay==='vhs' || overlay==='grain-heavy') { ctx.fillStyle='rgba(255,255,255,.05)'; for(let y=0;y<H;y+=4) ctx.fillRect(0,y,W,1) }
  if (overlay==='fireworks') { parts.forEach(p=>{ p.a+=.02; const r=p.r*(0.4+0.6*Math.sin(t*Math.PI)); ctx.beginPath(); ctx.arc(p.x+Math.cos(p.p)*r, p.y+Math.sin(p.p)*r*.7, 2, 0, 7); ctx.fillStyle=p.c; ctx.fill() }) }
  if (overlay==='halftone') { ctx.fillStyle='rgba(0,0,0,.18)'; for(let x=4;x<W;x+=10) for(let y=4;y<H;y+=10){ ctx.beginPath(); ctx.arc(x,y,1.4,0,7); ctx.fill() } }
  if (overlay==='flicker' && Math.random()<.12) { ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(0,0,W,H) }
  ctx.restore()
}
function mkParts(overlay, W, H) {
  const cols = ['#d9ff4a','#ff477e','#4ac8ff','#ffb84a','#b44aff','#ffffff']
  const n = overlay==='rain'?130 : overlay==='snow'||overlay==='confetti' ? 90 : overlay==='money'?46 : 60
  return Array.from({length:n},()=>({ x:Math.random()*W, y:Math.random()*H, v:.6+Math.random()*2.6, p:Math.random()*7, r:Math.random()*7, vr:(Math.random()-.5)*.12, s:.8+Math.random()*2.2, c:cols[Math.random()*cols.length|0] }))
}

export async function exportVideoWebM({ imageUrl, motion, duration=5, filter='none', overlay='none', shots=null, onProgress }) {
  const W=960, H=540
  const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H
  const ctx = canvas.getContext('2d')
  const stream = canvas.captureStream(30)
  const mime = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=> window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data)
  const done = new Promise(r => rec.onstop = r)
  rec.start(120)
  const shotList = shots?.length ? shots : [{ imageUrl, motion, duration, filter, overlay }]
  const total = shotList.reduce((a,s)=>a+(s.duration||5),0)
  let elapsed = 0
  for (const shot of shotList) {
    const img = await loadImg(shot.imageUrl)
    const parts = mkParts(shot.overlay, W, H)
    const dur = (shot.duration||5)*1000, start = performance.now()
    await new Promise(res => {
      const frame = (now) => {
        const t = Math.min(1, (now-start)/dur)
        ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H)
        drawCover(ctx, img, W, H, motionAt(shot.motion, t, now), shot.filter)
        drawOverlayFx(ctx, W, H, shot.overlay, t, now, parts)
        // letterbox + vignette
        const vg = ctx.createRadialGradient(W/2,H/2,H*.42,W/2,H/2,H*.95); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.42)'); ctx.fillStyle=vg; ctx.fillRect(0,0,W,H)
        if (shot.caption) { ctx.font='600 19px Inter, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.55)'; const tw=ctx.measureText(shot.caption).width; ctx.fillRect(W/2-tw/2-14, H-58, tw+28, 34); ctx.fillStyle='#fff'; ctx.fillText(shot.caption, W/2, H-35) }
        onProgress?.(Math.min(99, Math.round(((elapsed + t*(shot.duration||5)) / total) * 100)))
        if (t<1) requestAnimationFrame(frame); else res()
      }
      requestAnimationFrame(frame)
    })
    elapsed += shot.duration||5
  }
  rec.stop(); await done
  return new Blob(chunks, { type: 'video/webm' })
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000)
}
export async function downloadImage(url, name) {
  try { const r = await fetch(url); downloadBlob(await r.blob(), name) }
  catch { const a=document.createElement('a'); a.href=url; a.download=name; a.target='_blank'; a.click() }
}
export const fileToDataURL = (file) => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file) })
