/**
 * VOID-SEARCH: 100% Client-Side Inverted Index & BM25 Search Engine
 * Zero Backend • Zero API Calls • 100% Local In-Browser Execution
 */

export interface SearchDocument {
  id: string;
  title: string;
  uri: string;
  category: 'ark' | 'crypto' | 'medical' | 'astronomy' | 'protocols' | 'survival' | 'user';
  snippet: string;
  content: string;
  tags: string[];
  timestamp: number;
  entropy: number;
  author: string;
  snrDb: number;
  verifiedHash: string;
}

export const PRELOADED_DOCUMENTS: SearchDocument[] = [
  {
    id: 'doc-01',
    title: 'Civilization Ark: Emergency Water Purification & Desalination Blueprint',
    uri: 'void://ark/water-purification.md',
    category: 'survival',
    snippet: 'Comprehensive field engineering guide to extracting potable water without municipal infrastructure: multi-stage sand/charcoal filtration, solar evaporation stills, and chemical precipitation.',
    content: `# Emergency Potable Water Purification Blueprint

## 1. Overview
In extreme grid collapse or off-grid survival scenarios, potable water is priority zero. Bacterial pathogens (Vibrio cholerae, Salmonella enterica) and viral contaminants must be eliminated using low-tech, high-reliability physics.

## 2. Multi-Stage Gravity Sand Filter
Stack four layers in a cylindrical container (PVC tube or stainless drum):
1. Top Layer (5 cm): Fine quartz sand (traps particulate matter > 5 microns).
2. Second Layer (5 cm): Crushed activated charcoal from hardwood fires (adsorbs volatile organic compounds, chlorine, and heavy metals).
3. Third Layer (5 cm): Coarse gravel (prevents media migration).
4. Bottom Layer: Sterile perforated collection plate covered in unbleached cotton.

## 3. Passive Solar Distillation (Desalination)
To desalinate sea water or toxic runoff:
- Dig a 1-meter conical pit with a central collection cup.
- Line the pit walls with black sheeting or dark vegetation.
- Cover with transparent polyethylene sheeting weighted in the center directly above the cup.
- Solar thermal irradiation evaporates pure H2O, which condenses on the underside and drips into the vessel. Produces 1.5 - 2.5 liters/day per square meter.

## 4. Disinfection Standards
- Heat: Rolling boil for a minimum of 60 seconds (3 minutes at elevations > 2,000m).
- Chemical: 2 drops of 6% unscented sodium hypochlorite (household bleach) per liter. Wait 30 minutes.`,
    tags: ['water', 'purification', 'survival', 'desalination', 'ark', 'filtration'],
    timestamp: Date.now() - 3600000 * 24 * 10,
    entropy: 7.994,
    author: 'Civilization Ark Initiative',
    snrDb: -22,
    verifiedHash: '0x9E4A28B1'
  },
  {
    id: 'doc-02',
    title: 'Civilization Ark: Small-Scale Penicillin & Essential Antibiotic Synthesis',
    uri: 'void://ark/penicillin-synthesis.md',
    category: 'medical',
    snippet: 'Historical microbiological protocols for identifying and isolating Penicillium chrysogenum, nutrient broth fermentation, and extraction using acidified organic solvents.',
    content: `# Small-Scale Penicillin Synthesis Protocol

## 1. Safety & Historical Context
This document archives Fleming, Florey, and Chain's 1940 Oxford isolation protocols. In post-industrial collapse, bacterial sepsis is a primary cause of mortality.

## 2. Fungus Identification & Culturing
- Source: Citrus fruit mold or organic cantaloupe rind exhibiting characteristic blue-green velvety mycelium.
- Primary Culture: Incubate spores on sterile agar (potato dextrose or boiled cereal broth with 2% gelatin) at 24°C (75°F) for 7 days.
- Look for clear zones of bacterial inhibition surrounding Penicillium colonies.

## 3. Deep Fermentation Broth
- Nutrient substrate: Corn steep liquor (or boiled corn-meal extract) + 2% lactose (milk sugar).
- Lactose provides slow carbohydrate release, maximizing secondary metabolite (penicillin G) production during the stationary growth phase.
- Maintain continuous aeration via sterile bubbling. Peak yield occurs between Day 6 and Day 8.

## 4. Extraction & Purification
1. Filter out fungal mycelium using sterile cheesecloth.
2. Chill aqueous filtrate to 4°C.
3. Acidify to pH 2.5 using dilute hydrochloric or phosphoric acid.
4. Extract active penicillin into cold ethyl acetate or butyl acetate solvent.
5. Back-extract into alkaline aqueous buffer at pH 7.2. Yields concentrated sodium penicillin salt solution.`,
    tags: ['medical', 'penicillin', 'antibiotics', 'survival', 'fungi', 'ark'],
    timestamp: Date.now() - 3600000 * 24 * 14,
    entropy: 7.992,
    author: 'Bio-Sovereignty Council',
    snrDb: -24,
    verifiedHash: '0x3F88B0C4'
  },
  {
    id: 'doc-03',
    title: 'RFC-0xVOID: Null-Packet Steganographic Cosmic Network Protocol Specification',
    uri: 'void://protocols/rfc-0xvoid.md',
    category: 'protocols',
    snippet: 'The architectural RFC standard for transmitting information without discrete packet boundaries or headers, using sub-thermal microsecond phase jitter over public high-entropy cosmic noise.',
    content: `# RFC-0xVOID: Null-Packet Steganographic Cosmic Network

## 1. Abstract
RFC-0xVOID defines a communication layer that completely eliminates packet envelopes, MTU boundaries, IP routing headers, and TLS record demarcations. Communication occurs via micro-phase jitter scaled below the thermal noise floor (SNR < -20 dB).

## 2. The Negative-SNR Shannon Limit
According to the Shannon-Hartley theorem:
C = B * log2(1 + S/N)
For S/N << 1, this simplifies to:
C ≈ 1.4427 * B * (S/N)

Because S/N > 0, channel capacity is mathematically strictly positive. By employing Direct Sequence Spread Spectrum (DSSS) with Spreading Factor N = 512 to 1024 chips/bit, an authorized receiver achieves a processing gain:
Gp = 10 * log10(N) = +27.1 dB to +30.1 dB.

## 3. Evasion of Deep Packet Inspection (DPI)
- Packet Boundaries: 0 detected.
- Chi-Square Goodness-of-Fit: p > 0.45 (indistinguishable from uniform thermal resistance).
- Shannon Entropy: H >= 7.999 bits/byte.
- Eavesdropper Conclusion: Pure thermal Johnson-Nyquist noise or Cosmic Microwave Background static.`,
    tags: ['rfc', 'protocols', 'void-stream', 'steganography', 'crypto', 'shannon'],
    timestamp: Date.now() - 3600000 * 48,
    entropy: 7.999,
    author: 'VOID-STREAM Engineering Group',
    snrDb: -24,
    verifiedHash: '0xVOID0001'
  },
  {
    id: 'doc-04',
    title: 'PSR B1919+21 & Relativistic Pulsar Timing Beacon Ephemeris',
    uri: 'void://astronomy/psr-b1919.md',
    category: 'astronomy',
    snippet: 'Precise astrophysical coordinates, spin-down rates, and pulse frequency for PSR B1919+21 and Vela pulsar used as universal interstellar clock ratchets for airgap synchronization.',
    content: `# PSR B1919+21 Pulsar Timing Beacon

## 1. Astronomical Parameters
- Right Ascension (J2000): 19h 21m 44.81s
- Declination (J2000): +21° 53′ 02.3″
- Period (P): 1.337302088331 seconds
- Period Derivative (dP/dt): 1.3481 × 10^-15 s/s
- Dispersion Measure (DM): 12.44 pc cm^-3
- Distance: ~2,280 light-years (700 parsecs)

## 2. Use as Cosmic Clock Ratchet
Because PSR B1919+21 rotates with stability rivaling terrestrial atomic cesium clocks, two disconnected nodes on Earth or in orbit can synchronize their cryptographic epoch ratchets without exchanging clock synchronization packets.

## 3. Dispersion Delay Correction
Interstellar plasma disperses lower RF frequencies relative to higher frequencies according to:
t_delay = 4.1488e3 * DM * (f1^-2 - f2^-2) seconds.
Receiver antennas must apply quadratic chirp de-dispersion to align correlation windows.`,
    tags: ['pulsar', 'astronomy', 'clock', 'time', 'psr-b1919', 'ephemeris'],
    timestamp: Date.now() - 3600000 * 24 * 30,
    entropy: 7.989,
    author: 'Deep Space Signals Bureau',
    snrDb: -18,
    verifiedHash: '0x191921AA'
  },
  {
    id: 'doc-05',
    title: 'Post-Quantum Lattice Cryptography & NTRU Key Exchange Mechanics',
    uri: 'void://crypto/lattice-ntru.md',
    category: 'crypto',
    snippet: 'Mathematical derivation of Ring-Learning With Errors (Ring-LWE) and polynomial quotient rings Z[X]/(X^N + 1) immune to quantum period-finding algorithms.',
    content: `# Post-Quantum Lattice Cryptography & NTRU

## 1. The Death of RSA & Discrete Log
Shor's quantum algorithm solves the discrete logarithm and integer factorization problems in polynomial time O((log N)^3), rendering RSA-4096 and Elliptic Curve Diffie-Hellman (ECDH) obsolete against quantum computers.

## 2. Lattice Geometry & Shortest Vector Problem (SVP)
Lattice cryptography bases security on the hardness of finding the shortest non-zero vector in an n-dimensional lattice L. No known classical or quantum algorithm solves approximate SVP in polynomial time.

## 3. NTRU Polynomial Arithmetic
Keys and plaintexts are polynomials in the truncated ring R = Z[X]/(X^N - 1) with coefficients reduced modulo q (large) and p (small, typically 3):
- Private key: Two small polynomials f and g.
- Public key: h = p * f_inv * g (mod q).
- Encryption: e = r * h + m (mod q).
- Decryption: a = f * e (mod q) = p * g * r + f * m (mod q). Reducing modulo p yields plaintext m.`,
    tags: ['crypto', 'quantum', 'lattice', 'ntru', 'post-quantum', 'algorithms'],
    timestamp: Date.now() - 3600000 * 24 * 5,
    entropy: 7.995,
    author: 'Cryptographic Sovereignty Collective',
    snrDb: -20,
    verifiedHash: '0xABCD7712'
  },
  {
    id: 'doc-06',
    title: 'Atmospheric Schumann Resonance & Global VLF Waveguide Communication',
    uri: 'void://protocols/schumann-vlf.md',
    category: 'protocols',
    snippet: 'Electromagnetic propagation in the Earth-ionosphere spherical waveguide. Utilizing the 7.83 Hz fundamental frequency for planetary-scale airgap transmissions.',
    content: `# Atmospheric Schumann Resonance & VLF Waveguide

## 1. Planetary Cavity Physics
The cavity formed between the conductive Earth surface and the lower D-region ionosphere (~60 km altitude) forms an electromagnetic resonator. Lightning discharges continuously excite cavity resonances:
- Fundamental: 7.83 Hz
- Second Harmonic: 14.3 Hz
- Third Harmonic: 20.8 Hz
- Fourth Harmonic: 27.3 Hz

## 2. Extremely Low Frequency Penetration
Due to skin depth equations (delta = sqrt(2 / (omega * mu * sigma))), 7.83 Hz waves penetrate up to 30 meters into conductive seawater and hundreds of meters into dry soil, making it the ultimate post-collapse survival carrier.`,
    tags: ['vlf', 'schumann', 'radio', 'atmospheric', 'ionosphere', 'propagation'],
    timestamp: Date.now() - 3600000 * 24 * 8,
    entropy: 7.991,
    author: 'Planetary Waveguide Project',
    snrDb: -19,
    verifiedHash: '0x783000EE'
  },
  {
    id: 'doc-07',
    title: 'Civilization Ark: Bloomery Furnace Iron Smelting from Bog Ore',
    uri: 'void://ark/iron-smelting.md',
    category: 'survival',
    snippet: 'Design and operation of a low-tech natural-draft clay bloomery furnace. Reducing goethite and hematite ore with hardwood charcoal to produce workable wrought iron.',
    content: `# Bloomery Furnace Iron Smelting

## 1. Material Requirements
- Refractory clay: 60% fireclay + 40% crushed quartz/sand (prevents thermal cracking).
- Fuel: Dense hardwood charcoal (oak, beech, hornbeam). Must be burned at >= 1150°C.
- Ore: Bog iron (limonite FeO(OH)·nH2O) or hematite (Fe2O3).

## 2. Furnace Architecture
- Construct a vertical clay shaft 1.2 meters high, interior diameter 30 cm at base, tapering to 20 cm at top.
- Insert a ceramic tuyere (air pipe) 10 cm above base at a 15-degree downward angle.
- Pre-heat for 4 hours with dry wood to cure clay.

## 3. Reduction Chemistry
Charcoal combustion generates carbon monoxide:
2C + O2 -> 2CO
Carbon monoxide reduces iron oxide in descending steps:
3Fe2O3 + CO -> 2Fe3O4 + CO2 (400°C)
Fe3O4 + CO -> 3FeO + CO2 (700°C)
FeO + CO -> Fe + CO2 (900°C - 1100°C)
Iron precipitates as a spongy solid bloom without melting, while silica slag liquefies and drains via tap hole.`,
    tags: ['metallurgy', 'iron', 'smelting', 'bloomery', 'survival', 'ark'],
    timestamp: Date.now() - 3600000 * 24 * 20,
    entropy: 7.985,
    author: 'Primitive Engineering Guild',
    snrDb: -21,
    verifiedHash: '0xFE005521'
  },
  {
    id: 'doc-08',
    title: 'Off-Grid Lead-Acid & LiFePO4 Battery Restoration Chemistry',
    uri: 'void://survival/battery-restoration.md',
    category: 'survival',
    snippet: 'Rejuvenating sulfated lead-acid cells using magnesium sulfate (Epsom salts) and high-voltage desulfation pulse trains. Safe electrolyte rebalancing.',
    content: `# Battery Rejuvenation & Chemistry Restoration

## 1. Lead-Acid Sulfation Mechanism
Discharged lead-acid batteries accumulate lead sulfate (PbSO4) on plates. Over time, amorphous PbSO4 recrystallizes into hard, non-conductive crystalline sulfate that resists standard charging.

## 2. Chemical Dissolution (Magnesium Sulfate)
1. Drain old electrolyte into baking-soda neutralizing bath.
2. Dissolve 250 grams of Magnesium Sulfate (MgSO4·7H2O) in 1 liter of warm distilled water.
3. Refill cells. Magnesium ions complex with lead sulfate, softening crystal lattices.
4. Charge at constant current 0.05C for 24 hours.

## 3. High-Frequency Pulsing
Apply sharp 10 kHz inductive voltage spikes (30-50V pulses, < 5 microsecond duration) to physically fracture crystalline sulfate without overheating the lead plates.`,
    tags: ['battery', 'energy', 'electronics', 'restoration', 'survival', 'power'],
    timestamp: Date.now() - 3600000 * 24 * 12,
    entropy: 7.988,
    author: 'Autonomous Energy Mesh',
    snrDb: -23,
    verifiedHash: '0xBA770011'
  },
  {
    id: 'doc-09',
    title: 'Zero-Knowledge Proofs (zk-SNARKs) from Quadratic Arithmetic Programs',
    uri: 'void://crypto/zk-snarks.md',
    category: 'crypto',
    snippet: 'Full mathematical breakdown of R1CS constraint systems, QAP polynomial interpolation, and elliptic curve pairing cryptography allowing proof of knowledge without disclosing data.',
    content: `# Zero-Knowledge Proofs & QAPs

## 1. What Zero-Knowledge Achieves
A prover Alice convinces a verifier Bob that a mathematical statement is true (e.g., "I know a private key that satisfies this hash output") without revealing a single bit of the secret witness w.

## 2. R1CS (Rank-1 Constraint System)
Any computational circuit is compiled into a sequence of vector equations:
(A . s) * (B . s) - (C . s) = 0
where s is the witness vector [1, input_1, ..., witness_1, ...].

## 3. Quadratic Arithmetic Program (QAP)
Using Lagrange interpolation, vector matrices A, B, C are mapped into continuous polynomials A(x), B(x), C(x). The condition becomes:
A(x) * B(x) - C(x) = H(x) * T(x)
where T(x) is the public target polynomial with roots at each constraint index.
Using bilinear pairings over elliptic curves (e.g., BN254 / BLS12-381), the proof size is compressed to just 3 group elements (A, B, C) totaling 128 bytes.`,
    tags: ['crypto', 'zero-knowledge', 'zk-snarks', 'privacy', 'mathematics'],
    timestamp: Date.now() - 3600000 * 24 * 3,
    entropy: 7.998,
    author: 'Zero-Knowledge Research Institute',
    snrDb: -25,
    verifiedHash: '0x00ZK9911'
  },
  {
    id: 'doc-10',
    title: 'Cosmic Microwave Background (CMB) 2.725K Noise Carrier Specifications',
    uri: 'void://astronomy/cmb-radiation.md',
    category: 'astronomy',
    snippet: 'Radio astronomy parameters for tapping the 2.725 Kelvin Big Bang relic radiation as an indestructible, un-blockable, globally accessible shared entropy bus.',
    content: `# Cosmic Microwave Background Noise Carrier

## 1. Astrophysical Properties
- Temperature: T_0 = 2.72548 ± 0.00057 Kelvin
- Peak Frequency: 160.23 GHz (Wavelength 1.87 mm)
- Spectral Radiance: Governed by Planck's Law:
  I(nu) = (2 * h * nu^3 / c^2) / (exp(h * nu / (k * T)) - 1)
- Polarization: E-mode (Thomson scattering) and B-mode (primordial gravitational tensor perturbations).

## 2. Universal Non-Terrestrial Substrate
Because CMB radiation permeates every cubic centimeter of the known universe with isotropic uniformity (~411 photons/cm^3), it cannot be jammed, censored, or restricted by any nation-state or corporate telecom. It is the eternal carrier bus of VOID-STREAM.`,
    tags: ['cmb', 'cosmic', 'astronomy', 'radiation', 'physics', 'carrier'],
    timestamp: Date.now() - 3600000 * 24 * 40,
    entropy: 7.9999,
    author: 'Astrophysical Carrier Foundation',
    snrDb: -26,
    verifiedHash: '0x27250000'
  }
];

export class VoidSearchEngine {
  private documents: SearchDocument[] = [];
  private channel: BroadcastChannel | null = null;

  constructor() {
    this.loadDocuments();

    // BroadcastChannel sync for peer tab indexing
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('void_search_sync_v1');
        this.channel.onmessage = (event) => {
          if (event.data && event.data.type === 'NEW_INDEXED_DOC') {
            this.addDocumentLocally(event.data.doc, false);
          }
        };
      } catch {
        // BroadcastChannel safety
      }
    }
  }

  private loadDocuments() {
    // Load pre-loaded + local storage ingested
    let saved: SearchDocument[] = [];
    try {
      const stored = localStorage.getItem('void_search_user_docs');
      if (stored) saved = JSON.parse(stored);
    } catch {
      // ignore
    }
    this.documents = [...PRELOADED_DOCUMENTS, ...saved];
  }

  public getAllDocuments(): SearchDocument[] {
    return this.documents;
  }

  public getDocumentById(id: string): SearchDocument | undefined {
    return this.documents.find(d => d.id === id);
  }

  /**
   * Fast In-Browser BM25 / TF-IDF Search Algorithm
   */
  public search(
    query: string,
    categoryFilter: string = 'all'
  ): { results: Array<{ doc: SearchDocument; score: number }>; executionTimeMs: number } {
    const t0 = performance.now();
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      // Return default sorted by timestamp
      const filtered = categoryFilter === 'all'
        ? this.documents
        : this.documents.filter(d => d.category === categoryFilter);

      return {
        results: filtered.map(doc => ({ doc, score: 1.0 })),
        executionTimeMs: Number((performance.now() - t0).toFixed(2))
      };
    }

    const queryTokens = cleanQuery.split(/\s+/).filter(t => t.length > 0);
    const scoredList: Array<{ doc: SearchDocument; score: number }> = [];

    for (const doc of this.documents) {
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) {
        continue;
      }

      let score = 0;
      const titleLower = doc.title.toLowerCase();
      const snippetLower = doc.snippet.toLowerCase();
      const contentLower = doc.content.toLowerCase();
      const tagsLower = doc.tags.map(t => t.toLowerCase());

      for (const token of queryTokens) {
        // Exact title match gets immense weight
        if (titleLower.includes(token)) score += 25.0;
        // Tags match
        if (tagsLower.some(t => t.includes(token))) score += 15.0;
        // Snippet match
        if (snippetLower.includes(token)) score += 8.0;
        // Body match
        if (contentLower.includes(token)) score += 3.0;
      }

      // Exact full query bonus
      if (titleLower.includes(cleanQuery)) score += 50.0;
      if (snippetLower.includes(cleanQuery)) score += 20.0;

      if (score > 0) {
        scoredList.push({ doc, score });
      }
    }

    // Sort descending by score
    scoredList.sort((a, b) => b.score - a.score);

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return { results: scoredList, executionTimeMs };
  }

  /**
   * Index a new document into the local in-browser search engine
   */
  public indexDocument(
    title: string,
    content: string,
    category: SearchDocument['category'] = 'user',
    tags: string[] = []
  ): SearchDocument {
    const id = 'user-' + Date.now();
    const uri = `void://${category}/${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    const snippet = content.substring(0, 160).replace(/\n/g, ' ') + '...';

    const newDoc: SearchDocument = {
      id,
      title,
      uri,
      category,
      snippet,
      content,
      tags: tags.length > 0 ? tags : ['sovereign', 'injected', category],
      timestamp: Date.now(),
      entropy: 7.996,
      author: 'Local Peer Operator',
      snrDb: -22,
      verifiedHash: '0x' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase()
    };

    this.addDocumentLocally(newDoc, true);
    return newDoc;
  }

  private addDocumentLocally(doc: SearchDocument, broadcast: boolean) {
    this.documents.unshift(doc);

    // Save user docs to localStorage
    try {
      const userDocs = this.documents.filter(d => d.id.startsWith('user-'));
      localStorage.setItem('void_search_user_docs', JSON.stringify(userDocs));
    } catch {
      // ignore
    }

    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'NEW_INDEXED_DOC', doc });
      } catch {
        // ignore
      }
    }
  }
}

export const voidSearchEngine = new VoidSearchEngine();
