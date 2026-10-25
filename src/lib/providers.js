// ─── BYOK provider layer ─────────────────────────────────────────────────────
// Live generations run browser → provider with the USER'S OWN API key.
// The user pays their provider directly; keys never leave their device
// (localStorage only) and this app's owner pays $0.
// Providers chosen because their APIs are CORS-safe from the browser:
//   fal.ai (video+image) · Google Gemini (Nano Banana/Veo family + LLM)
//   OpenRouter (LLM + image) · any OpenAI-compatible endpoint (custom)
// Replicate/OpenAI block browser CORS, so they work via the Custom slot
// if the user fronts them with their own proxy.

export const PROVIDERS = [
  { id:'fal', name:'fal.ai', blurb:'The Higgsfield-grade workhorse: Kling, Veo 3.1, Hailuo, Seedance, FLUX, Nano Banana — real video + image models, pay-per-generation.',
    getKey:'https://fal.ai/dashboard/keys', keyHint:'fal key (xxxxxxxx-xxxx-...:secret)', caps:['Video','Image'], grad:'from-violet-500 to-fuchsia-600' },
  { id:'gemini', name:'Google Gemini', blurb:'Direct from Google AI Studio: Nano Banana (Gemini 2.5 Flash Image) & Nano Banana Pro (Gemini 3 Pro Image), plus Gemini LLMs for the agent. Free tier available.',
    getKey:'https://aistudio.google.com/apikey', keyHint:'AIza… Google AI Studio key', caps:['Image','LLM'], grad:'from-sky-500 to-emerald-500' },
  { id:'openrouter', name:'OpenRouter', blurb:'One key, 300+ models: powers the Supercomputer brain and image models (Gemini Image, FLUX). Shows your real usage in Settings.',
    getKey:'https://openrouter.ai/keys', keyHint:'sk-or-v1-…', caps:['Image','LLM'], grad:'from-zinc-200 to-zinc-500' },
  { id:'custom', name:'Custom endpoint', blurb:'Any OpenAI-compatible API you pay for (Together, Fireworks, your own proxy for Replicate/OpenAI, a local gateway…). Chat + Images.',
    getKey:'', keyHint:'Bearer token', caps:['Image','LLM'], grad:'from-amber-400 to-orange-600' },
]

// ── fal endpoint maps (arrays = fallback chain if an endpoint 404s) ──
const FAL_IMAGE = {
  'nano-banana-pro': ['fal-ai/nano-banana-pro','fal-ai/nano-banana-2','fal-ai/nano-banana'],
  'nano-banana-2': ['fal-ai/nano-banana-2','fal-ai/nano-banana'],
  'soul-v2': ['fal-ai/nano-banana-pro','fal-ai/flux-pro/v1.1-ultra','fal-ai/flux/dev'],
  'flux-2-pro': ['fal-ai/flux-2-pro','fal-ai/flux-pro/v1.1','fal-ai/flux/dev'],
  'seedream-5': ['fal-ai/bytedance/seedream/v4/text-to-image','fal-ai/flux-pro/v1.1'],
  'gpt-image-2': ['fal-ai/gpt-image-1.5','fal-ai/gpt-image-1','fal-ai/nano-banana-pro'],
  'ideogram-4': ['fal-ai/ideogram/v3','fal-ai/ideogram/v2/turbo'],
  'recraft-v4': ['fal-ai/recraft-v3','fal-ai/recraft/v3/text-to-image'],
  'cinema-still': ['fal-ai/flux-pro/v1.1-ultra','fal-ai/flux-pro/v1.1'],
}
const FAL_VIDEO = {
  'seedance-2-5': { t2v:['fal-ai/bytedance/seedance/v1/pro/text-to-video','fal-ai/kling-video/v3/pro/text-to-video'], i2v:['fal-ai/bytedance/seedance/v1/pro/image-to-video','fal-ai/kling-video/v3/pro/image-to-video'] },
  'seedance-2': { t2v:['fal-ai/bytedance/seedance/v1/pro/text-to-video'], i2v:['fal-ai/bytedance/seedance/v1/pro/image-to-video'] },
  'seedance-fast': { t2v:['fal-ai/bytedance/seedance/v1/lite/text-to-video','fal-ai/ltx-2/text-to-video/fast'], i2v:['fal-ai/bytedance/seedance/v1/lite/image-to-video'] },
  'kling-4': { t2v:['fal-ai/kling-video/v3/pro/text-to-video'], i2v:['fal-ai/kling-video/v3/pro/image-to-video'] },
  'kling-3': { t2v:['fal-ai/kling-video/v3/pro/text-to-video','fal-ai/kling-video/v2.6/pro/text-to-video'], i2v:['fal-ai/kling-video/v3/pro/image-to-video','fal-ai/kling-video/v2.6/pro/image-to-video'] },
  'veo-3-1': { t2v:['fal-ai/veo3.1'], i2v:['fal-ai/veo3.1/image-to-video'] },
  'sora-2': { t2v:['fal-ai/veo3.1','fal-ai/kling-video/v3/pro/text-to-video'], i2v:['fal-ai/veo3.1/image-to-video'] },
  'genjutsu': { t2v:['fal-ai/kling-video/v3/pro/text-to-video'], i2v:['fal-ai/kling-video/v3/pro/image-to-video'] },
  'genjutsu-lite': { t2v:['fal-ai/ltx-2/text-to-video/fast','fal-ai/wan/v2.2-a14b/text-to-video'], i2v:['fal-ai/wan/v2.2-a14b/image-to-video'] },
  'dop-turbo': { t2v:['fal-ai/minimax/hailuo-02/standard/text-to-video','fal-ai/kling-video/v2.6/pro/text-to-video'], i2v:['fal-ai/minimax/hailuo-02/standard/image-to-video','fal-ai/kling-video/v2.6/pro/image-to-video'] },
  'hailuo-2-3': { t2v:['fal-ai/minimax/hailuo-02/standard/text-to-video'], i2v:['fal-ai/minimax/hailuo-02/standard/image-to-video','fal-ai/minimax/hailuo-02/pro/image-to-video'] },
  'wan-2-6': { t2v:['fal-ai/wan/v2.2-a14b/text-to-video'], i2v:['fal-ai/wan/v2.2-a14b/image-to-video'] },
  'ray-3': { t2v:['fal-ai/luma-dream-machine/ray-2','fal-ai/luma-dream-machine'], i2v:['fal-ai/luma-dream-machine/ray-2/image-to-video','fal-ai/luma-dream-machine'] },
  'runway-gen45': { t2v:['fal-ai/kling-video/v3/pro/text-to-video'], i2v:['fal-ai/kling-video/v3/pro/image-to-video'] },
}
const GEMINI_IMAGE = { 'nano-banana-pro':'gemini-3-pro-image-preview', 'soul-v2':'gemini-3-pro-image-preview', 'cinema-still':'gemini-3-pro-image-preview', 'gpt-image-2':'gemini-3-pro-image-preview', 'flux-2-pro':'gemini-3-pro-image-preview' }
const OR_IMAGE = { 'nano-banana-pro':'google/gemini-3-pro-image-preview', 'flux-2-pro':'black-forest-labs/flux.2-pro', 'seedream-5':'bytedance-seed/seedream-4.5' }

// rough public list-price estimates (USD) — providers bill the real amount
function estImage(endpoint='') {
  const e = endpoint.toLowerCase()
  if (e.includes('schnell')) return 0.003
  if (e.includes('nano-banana-pro') || e.includes('gemini-3-pro')) return 0.14
  if (e.includes('nano-banana')) return 0.04
  if (e.includes('ultra')) return 0.06
  if (e.includes('flux-pro') || e.includes('flux.2') || e.includes('flux-2')) return 0.04
  if (e.includes('ideogram')) return 0.08
  if (e.includes('gpt-image')) return 0.08
  if (e.includes('gemini-2.5-flash-image')) return 0.04
  return 0.03
}
function estVideoPerSec(endpoint='') {
  const e = endpoint.toLowerCase()
  if (e.includes('veo')) return e.includes('fast') ? 0.12 : 0.28
  if (e.includes('kling')) return 0.10
  if (e.includes('seedance')) return e.includes('lite') ? 0.05 : 0.12
  if (e.includes('hailuo') || e.includes('minimax')) return 0.05
  if (e.includes('luma')) return 0.08
  if (e.includes('ltx')) return 0.03
  if (e.includes('wan')) return 0.05
  return 0.08
}

export function estimateLive(spec, keys, prefs) {
  const r = resolveRoute(spec, keys, prefs)
  if (!r) return null
  return { ...r, usd: spec.type==='video' ? estVideoPerSec(r.endpoint) * (spec.duration||5) * (spec.count||1) : estImage(r.endpoint) * (spec.count||1) }
}

export function resolveRoute(spec, keys={}, prefs={}) {
  const hasImg = !!(spec.baseImage && (/^https?:/.test(spec.baseImage) || (spec.baseImage.startsWith('data:') && spec.baseImage.length < 1_600_000)))
  if (spec.type==='video') {
    if (!keys.fal) return null
    const map = FAL_VIDEO[spec.modelId] || FAL_VIDEO['kling-3']
    const chain = hasImg ? map.i2v : map.t2v
    return { provider:'fal', providerName:'fal.ai', endpoint: chain[0], chain, i2v: hasImg }
  }
  const order = [prefs.image, 'fal', 'gemini', 'openrouter', 'custom'].filter((v,i,a)=> v && a.indexOf(v)===i)
  for (const p of order) {
    if (p==='fal' && keys.fal) {
      let chain = FAL_IMAGE[spec.modelId] || ['fal-ai/flux/dev']
      if (spec.baseImage) chain = [...chain.filter(e=>e.includes('nano-banana')).map(e=>e+'/edit'), ...chain]
      return { provider:'fal', providerName:'fal.ai', endpoint: chain[0], chain }
    }
    if (p==='gemini' && keys.gemini) return { provider:'gemini', providerName:'Google Gemini', endpoint: GEMINI_IMAGE[spec.modelId] || 'gemini-2.5-flash-image' }
    if (p==='openrouter' && keys.openrouter) return { provider:'openrouter', providerName:'OpenRouter', endpoint: OR_IMAGE[spec.modelId] || 'google/gemini-2.5-flash-image' }
    if (p==='custom' && keys.customKey && keys.customBase) return { provider:'custom', providerName:'Custom endpoint', endpoint: keys.customImageModel || 'gpt-image-1' }
  }
  return null
}
export function resolveLLM(keys={}, prefs={}) {
  const order = [prefs.llm, 'openrouter', 'gemini', 'custom'].filter((v,i,a)=> v && a.indexOf(v)===i)
  for (const p of order) {
    if (p==='openrouter' && keys.openrouter) return { provider:'openrouter', model: keys.orModel || 'google/gemini-2.5-flash' }
    if (p==='gemini' && keys.gemini) return { provider:'gemini', model:'gemini-2.5-flash' }
    if (p==='custom' && keys.customKey && keys.customBase) return { provider:'custom', model: keys.customChatModel || 'gpt-4o-mini' }
  }
  return null
}

// ── helpers ──
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms))
async function jfetch(url, opts={}) {
  const res = await fetch(url, opts)
  const text = await res.text().catch(()=> '')
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) { const err = new Error(data?.error?.message || data?.detail || data?.message || `HTTP ${res.status} from ${new URL(url).hostname}`); err.status = res.status; err.data = data; throw err }
  return data
}
const aspectOf = (spec) => spec.ratio || '16:9'
function falImageSize(ratio='16:9') {
  return { '1:1':'square_hd', '16:9':'landscape_16_9', '9:16':'portrait_16_9', '4:3':'landscape_4_3', '3:4':'portrait_4_3', '4:5':'portrait_4_3', '3:2':'landscape_4_3', '2:3':'portrait_4_3', '21:9':'landscape_16_9' }[ratio] || 'landscape_16_9'
}
function falDuration(endpoint, dur=5) {
  const e = endpoint.toLowerCase()
  if (e.includes('veo')) return (dur<=4?'4s':dur<=6?'6s':'8s')
  if (e.includes('kling')) return String(dur<=5?5:10)
  if (e.includes('hailuo') || e.includes('minimax')) return dur<=6?6:10
  return String(Math.min(10, Math.max(3, dur)))
}

// ── fal queue runner with endpoint fallback ──
async function falRun(key, chain, buildInput, onProgress, timeoutMs) {
  let lastErr
  for (const endpoint of chain) {
    try {
      return await falOnce(key, endpoint, buildInput(endpoint), onProgress, timeoutMs, endpoint)
    } catch (err) {
      lastErr = err
      if (err.status===422) { // schema mismatch → retry same endpoint with prompt-only input
        try { return await falOnce(key, endpoint, buildInput(endpoint, true), onProgress, timeoutMs, endpoint) }
        catch (e2) { lastErr = e2; if (![404,405,422].includes(e2.status)) throw e2 }
      } else if (![404,405].includes(err.status)) throw err
      onProgress?.(8, `Endpoint unavailable — failing over…`)
    }
  }
  throw lastErr || new Error('All fal endpoints failed')
}
async function falOnce(key, endpoint, input, onProgress, timeoutMs, label) {
  const headers = { 'Authorization': `Key ${key}`, 'Content-Type':'application/json' }
  onProgress?.(6, `Submitting to fal.ai · ${label}`)
  const sub = await jfetch(`https://queue.fal.run/${endpoint}`, { method:'POST', headers, body: JSON.stringify(input) })
  const statusUrl = sub.status_url || `https://queue.fal.run/${endpoint}/requests/${sub.request_id}/status`
  const resultUrl = sub.response_url || `https://queue.fal.run/${endpoint}/requests/${sub.request_id}`
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2500)
    const st = await jfetch(statusUrl, { headers }).catch(()=>({ status:'IN_PROGRESS' }))
    const elapsed = (Date.now()-t0)/1000
    if (st.status==='COMPLETED') break
    if (st.status==='FAILED' || st.status==='ERROR') throw new Error('fal.ai reported a failed generation — you are not billed for failed runs')
    onProgress?.(Math.min(92, 12 + elapsed * 1.4), st.status==='IN_QUEUE' ? 'Queued on fal.ai…' : 'Generating on fal.ai (billed to your account)…')
  }
  onProgress?.(96, 'Fetching result…')
  const data = await jfetch(resultUrl, { headers })
  return { data: data?.data ?? data, endpoint }
}

// ── public generation entry points ──
export async function generateLive(spec, route, keys, onProgress) {
  const count = spec.count || 1
  const results = []
  for (let i=0; i<count; i++) {
    const base = i / count * 100
    const prog = (p, txt)=> onProgress?.(Math.round(base + p/count), count>1 ? `[${i+1}/${count}] ${txt}` : txt)
    if (route.provider==='fal') results.push(await liveFal(spec, route, keys.fal, prog))
    else if (route.provider==='gemini') results.push(await liveGeminiImage(spec, route, keys.gemini, prog))
    else if (route.provider==='openrouter') results.push(await liveOpenRouterImage(spec, route, keys.openrouter, prog))
    else if (route.provider==='custom') results.push(await liveCustomImage(spec, route, keys, prog))
  }
  return results // [{url, videoUrl?, endpoint, usd}]
}

async function liveFal(spec, route, key, onProgress) {
  const isVideo = spec.type==='video'
  const buildInput = (endpoint, minimal=false) => {
    if (!isVideo) {
      if (minimal) return { prompt: spec.prompt }
      if (endpoint.endsWith('/edit') && spec.baseImage) return { prompt: spec.prompt, image_urls: [spec.baseImage] }
      if (endpoint.includes('nano-banana')) return { prompt: spec.prompt, aspect_ratio: aspectOf(spec), num_images: 1 }
      return { prompt: spec.prompt, image_size: falImageSize(aspectOf(spec)), num_images: 1 }
    }
    const img = {}
    if (route.i2v && spec.baseImage) img.image_url = spec.baseImage
    if (minimal) return { prompt: spec.prompt, ...img }
    return { prompt: spec.prompt, ...img, duration: falDuration(endpoint, spec.duration||5), aspect_ratio: aspectOf(spec) }
  }
  const { data, endpoint } = await falRun(key, route.chain, buildInput, onProgress, isVideo ? 12*60*1000 : 4*60*1000)
  if (isVideo) {
    const url = data?.video?.url || data?.video_url || data?.output?.video?.url
    if (!url) throw new Error('fal.ai returned no video URL')
    return { url, videoUrl: url, endpoint, usd: estVideoPerSec(endpoint) * (spec.duration||5) }
  }
  const url = data?.images?.[0]?.url || data?.image?.url || data?.output?.[0]
  if (!url) throw new Error('fal.ai returned no image URL')
  return { url, endpoint, usd: estImage(endpoint) }
}

async function liveGeminiImage(spec, route, key, onProgress) {
  onProgress?.(20, `Asking Google · ${route.endpoint}`)
  const parts = []
  if (spec.baseImage?.startsWith('data:')) {
    const [meta, b64] = spec.baseImage.split(',')
    parts.push({ inlineData: { mimeType: meta.match(/data:(.*?);/)?.[1] || 'image/jpeg', data: b64 } })
  }
  parts.push({ text: spec.prompt })
  const supported = ['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9']
  const data = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models/${route.endpoint}:generateContent`, {
    method:'POST', headers: { 'x-goog-api-key': key, 'Content-Type':'application/json' },
    body: JSON.stringify({ contents:[{ parts }], generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio: supported.includes(aspectOf(spec)) ? aspectOf(spec) : '16:9' } } }),
  })
  onProgress?.(90, 'Receiving image…')
  const part = data?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)
  if (!part) throw new Error('Gemini returned no image (the prompt may have been filtered)')
  return { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, endpoint: route.endpoint, usd: estImage(route.endpoint) }
}

async function liveOpenRouterImage(spec, route, key, onProgress) {
  onProgress?.(20, `Asking OpenRouter · ${route.endpoint}`)
  const content = []
  if (spec.baseImage) content.push({ type:'image_url', image_url:{ url: spec.baseImage } })
  content.push({ type:'text', text: spec.prompt })
  const call = (model)=> jfetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST', headers: { 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json', 'X-Title':'Higgsfield (BYOK)' },
    body: JSON.stringify({ model, messages:[{ role:'user', content }], modalities:['image','text'], image_config:{ aspect_ratio: aspectOf(spec), image_size:'1K' } }),
  })
  let data
  try { data = await call(route.endpoint) }
  catch (e) { if (route.endpoint!=='google/gemini-2.5-flash-image') { onProgress?.(40, 'Model unavailable — falling back to Gemini Flash Image'); data = await call('google/gemini-2.5-flash-image'); route.endpoint='google/gemini-2.5-flash-image' } else throw e }
  onProgress?.(90, 'Receiving image…')
  const msg = data?.choices?.[0]?.message
  const url = msg?.images?.[0]?.image_url?.url || (Array.isArray(msg?.content) ? msg.content.find(c=>c.type==='image_url')?.image_url?.url : null)
  if (!url) throw new Error('OpenRouter returned no image for that model/prompt')
  return { url, endpoint: route.endpoint, usd: estImage(route.endpoint) }
}

async function liveCustomImage(spec, route, keys, onProgress) {
  onProgress?.(25, `Asking your endpoint · ${route.endpoint}`)
  const size = { '1:1':'1024x1024', '16:9':'1536x864', '9:16':'864x1536' }[aspectOf(spec)] || '1024x1024'
  const data = await jfetch(`${keys.customBase.replace(/\/$/,'')}/images/generations`, {
    method:'POST', headers: { 'Authorization':`Bearer ${keys.customKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: route.endpoint, prompt: spec.prompt, size, n: 1 }),
  })
  const d = data?.data?.[0]
  const url = d?.url || (d?.b64_json ? `data:image/png;base64,${d.b64_json}` : null)
  if (!url) throw new Error('Custom endpoint returned no image')
  return { url, endpoint: route.endpoint, usd: estImage(route.endpoint) }
}

// ── LLM chat (Supercomputer brain, prompt enhancer, Mr. Higgs) ──
export async function llmChat(messages, keys, prefs) {
  const r = resolveLLM(keys, prefs)
  if (!r) return null
  if (r.provider==='openrouter' || r.provider==='custom') {
    const base = r.provider==='openrouter' ? 'https://openrouter.ai/api/v1' : keys.customBase.replace(/\/$/,'')
    const key = r.provider==='openrouter' ? keys.openrouter : keys.customKey
    const data = await jfetch(`${base}/chat/completions`, {
      method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json', 'X-Title':'Higgsfield (BYOK)' },
      body: JSON.stringify({ model: r.model, messages, max_tokens: 900 }),
    })
    return data?.choices?.[0]?.message?.content || null
  }
  // gemini
  const sys = messages.find(m=>m.role==='system')?.content
  const contents = messages.filter(m=>m.role!=='system').map(m=>({ role: m.role==='assistant' ? 'model' : 'user', parts:[{ text: m.content }] }))
  const data = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent`, {
    method:'POST', headers:{ 'x-goog-api-key': keys.gemini, 'Content-Type':'application/json' },
    body: JSON.stringify({ ...(sys ? { systemInstruction:{ parts:[{ text: sys }] } } : {}), contents }),
  })
  return data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || null
}

// ── key tests (no-spend auth checks) ──
export async function testKey(provider, keys) {
  try {
    if (provider==='fal') {
      const res = await fetch('https://queue.fal.run/fal-ai/flux/schnell/requests/hf-auth-check/status', { headers:{ 'Authorization':`Key ${keys.fal}` } })
      if (res.status===401 || res.status===403) return { ok:false, msg:'Key rejected by fal.ai (401). Check the key and that billing is enabled.' }
      return { ok:true, msg:'Authenticated with fal.ai. Generations will bill your fal balance.' }
    }
    if (provider==='gemini') {
      const d = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keys.gemini)}`)
      return { ok:true, msg:`Authenticated. ${d.models?.length || 0} models available on your Google account.` }
    }
    if (provider==='openrouter') {
      const d = await jfetch('https://openrouter.ai/api/v1/auth/key', { headers:{ 'Authorization':`Bearer ${keys.openrouter}` } })
      const u = d.data || {}
      return { ok:true, msg:`Authenticated. Real OpenRouter usage so far: $${(u.usage ?? 0).toFixed?.(2) ?? u.usage}${u.limit ? ` of $${u.limit} limit` : ' (no key limit set)'}.`, usage: u }
    }
    if (provider==='custom') {
      await jfetch(`${keys.customBase.replace(/\/$/,'')}/models`, { headers:{ 'Authorization':`Bearer ${keys.customKey}` } })
      return { ok:true, msg:'Custom endpoint reachable and authenticated.' }
    }
  } catch (e) { return { ok:false, msg: e.message } }
  return { ok:false, msg:'Unknown provider' }
}
export const money = (n)=> '$' + (n >= 1 ? n.toFixed(2) : n.toFixed(3))
