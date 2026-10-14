import type { BadgeContext } from "./account";
import { BOT_PROFILES } from "./ai";
import type { BotKind } from "./types";

/**
 * The contract board.
 *
 * A contract is a standing order the account is working on: three are open at a
 * time, and when one is signed off the next unopened order takes its slot. They
 * give a career somewhere to go between runs, and they are the reason a player
 * might pick a marksman loadout or a new arena on a Tuesday night.
 *
 * Two shapes, because a career has two kinds of progress:
 *
 * - `count` orders measure work done *from the moment they are opened*, so the
 *   baseline is captured at activation and only the delta counts. "Eliminate 25
 *   more hostiles" means twenty-five more, not twenty-five ever.
 * - `milestone` orders measure a career high that either was passed at some
 *   point or was not, so they are judged absolutely. A milestone that is already
 *   true when the board reaches it is signed off immediately rather than handed
 *   to the player as a task that starts complete.
 */

export interface ContractStats extends BadgeContext {
  killsByKind: Record<BotKind, number>;
  deathsByKind: Record<BotKind, number>;
}

export type ContractMetric = (stats: ContractStats) => number;

export interface Contract {
  id: string;
  name: string;
  /** What it takes, in one line, as a standing order. */
  requirement: string;
  kind: "count" | "milestone";
  target: number;
  metric: ContractMetric;
}

/** How many orders are open at once. */
export const CONTRACT_SLOTS = 3;

const kindKills = (kind: BotKind): ContractMetric => (stats) => stats.killsByKind[kind] ?? 0;
const profileName = (kind: BotKind) => BOT_PROFILES[kind].name;

/**
 * The board, in the order orders are handed out: quicker, more instructive work
 * first, career-defining work last. `tests/contracts.test.ts` keeps this honest
 * (unique ids, positive targets, metrics that actually read the stat they name).
 */
export const CONTRACTS: Contract[] = [
  {
    id: "first-contact",
    name: "FIRST CONTACT",
    requirement: "Finish 3 runs",
    kind: "count",
    target: 3,
    metric: (stats) => stats.runs
  },
  {
    id: "field-test",
    name: "FIELD TEST",
    requirement: "Eliminate 25 hostiles",
    kind: "count",
    target: 25,
    metric: (stats) => stats.kills
  },
  {
    id: "spotter",
    name: "SPOTTER",
    requirement: "Eliminate 6 marksman hostiles",
    kind: "count",
    target: 6,
    metric: kindKills("sniper")
  },
  {
    id: "pest-control",
    name: "PEST CONTROL",
    requirement: "Eliminate 10 swarm shards",
    kind: "count",
    target: 10,
    metric: kindKills("shard")
  },
  {
    id: "wind-up-cutter",
    name: "WIND-UP CUTTER",
    requirement: "Cut 8 hostile wind-ups",
    kind: "count",
    target: 8,
    metric: (stats) => stats.interrupts
  },
  {
    id: "wall-breaker",
    name: "WALL BREAKER",
    requirement: `Eliminate 5 ${profileName("shielder").toLowerCase()}s`,
    kind: "count",
    target: 5,
    metric: kindKills("shielder")
  },
  {
    id: "counterbattery",
    name: "COUNTERBATTERY",
    requirement: `Eliminate 4 ${profileName("mortar").toLowerCase()}s`,
    kind: "count",
    target: 4,
    metric: kindKills("mortar")
  },
  {
    id: "hot-work",
    name: "HOT WORK",
    requirement: `Eliminate 4 ${profileName("pyro").toLowerCase()}s`,
    kind: "count",
    target: 4,
    metric: kindKills("pyro")
  },
  {
    id: "ram-stop",
    name: "RAM STOP",
    requirement: `Eliminate 5 ${profileName("charger").toLowerCase()}s`,
    kind: "count",
    target: 5,
    metric: kindKills("charger")
  },
  {
    id: "sharpshooter",
    name: "SHARPSHOOTER",
    requirement: "Finish a run at 70% accuracy or better",
    kind: "milestone",
    target: 70,
    metric: (stats) => stats.bestAccuracy
  },
  {
    id: "chain-reaction",
    name: "CHAIN REACTION",
    requirement: "Reach a 6-elimination chain",
    kind: "milestone",
    target: 6,
    metric: (stats) => stats.bestCombo
  },
  {
    id: "arena-tour",
    name: "ARENA TOUR",
    requirement: "Win a run in 3 different arenas",
    kind: "milestone",
    target: 3,
    metric: (stats) => stats.arenasCleared.length
  },
  {
    id: "clean-sheet",
    name: "CLEAN SHEET",
    requirement: "Win a run without taking damage",
    kind: "milestone",
    target: 1,
    metric: (stats) => stats.perfectVictories
  },
  {
    id: "gunsmith",
    name: "GUNSMITH",
    requirement: "Fly all 6 operative classes",
    kind: "milestone",
    target: 6,
    metric: (stats) => stats.classesFlown
  },
  {
    id: "veteran-order",
    name: "VETERAN ORDER",
    requirement: "Win a run on veteran",
    kind: "milestone",
    target: 1,
    metric: (stats) => (stats.levelsCleared.includes("veteran") ? 1 : 0)
  },
  {
    id: "centurion",
    name: "CENTURION",
    requirement: "Eliminate 250 hostiles",
    kind: "count",
    target: 250,
    metric: (stats) => stats.kills
  },
  {
    id: "full-sweep",
    name: "FULL SWEEP",
    requirement: "Win a run on every threat level",
    kind: "milestone",
    target: 5,
    metric: (stats) => stats.levelsCleared.length
  }
];

export const CONTRACT_IDS: string[] = CONTRACTS.map((contract) => contract.id);

const BY_ID = new Map(CONTRACTS.map((contract) => [contract.id, contract]));

export function isContractId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}

/** One open order: the id, plus the metric reading it was opened at. */
export interface OpenContract {
  id: string;
  baseline: number;
}

export interface ContractState {
  active: OpenContract[];
  completed: string[];
}

export function emptyContractState(): ContractState {
  return { active: [], completed: [] };
}

/**
 * Repairs anything read back from storage: unknown or duplicated ids are
 * dropped, and completion order is preserved. A save written by an older build
 * that had fewer contracts simply loses the orders it cannot name.
 */
export function normalizeContractState(raw: unknown): ContractState {
  if (!raw || typeof raw !== "object") return emptyContractState();
  const record = raw as { active?: unknown; completed?: unknown };
  const completed: string[] = [];
  if (Array.isArray(record.completed)) {
    for (const id of record.completed) {
      if (isContractId(id) && !completed.includes(id)) completed.push(id);
    }
  }
  const active: OpenContract[] = [];
  if (Array.isArray(record.active)) {
    for (const entry of record.active) {
      if (!entry || typeof entry !== "object") continue;
      const { id, baseline } = entry as { id?: unknown; baseline?: unknown };
      if (!isContractId(id) || completed.includes(id)) continue;
      if (active.some((open) => open.id === id)) continue;
      const value = typeof baseline === "number" && Number.isFinite(baseline) ? baseline : 0;
      active.push({ id, baseline: value });
      if (active.length >= CONTRACT_SLOTS) break;
    }
  }
  return { active, completed };
}

/**
 * Fills every empty slot from the head of the board, signing off any milestone
 * that the career had already passed when the board reached it. Returns a new
 * state; the input is never mutated.
 */
export function fillContractSlots(state: ContractState, stats: ContractStats): ContractState {
  let active = state.active.map((open) => ({ ...open }));
  const completed = [...state.completed];
  // Bounded: the pool is finite, so the worst case is one pass over it per slot.
  let guard = CONTRACTS.length * (CONTRACT_SLOTS + 1) + CONTRACTS.length;
  while (active.length < CONTRACT_SLOTS && guard > 0) {
    guard -= 1;
    const next = CONTRACTS.find(
      (contract) => !completed.includes(contract.id) && !active.some((open) => open.id === contract.id)
    );
    if (!next) break;
    if (next.kind === "milestone" && next.metric(stats) >= next.target) {
      // Already true, so it is signed off rather than handed out half-done.
      completed.push(next.id);
      continue;
    }
    active = [...active, { id: next.id, baseline: next.metric(stats) }];
  }
  return { active, completed };
}

/** True when the open order has been satisfied at the given career reading. */
export function isContractMet(open: OpenContract, stats: ContractStats): boolean {
  const contract = BY_ID.get(open.id);
  if (!contract) return false;
  const value = contract.metric(stats);
  return contract.kind === "milestone" ? value >= contract.target : value - open.baseline >= contract.target;
}

export interface ContractAdvance {
  state: ContractState;
  /** Ids signed off by this reading, in the order they were closed. */
  signedOff: string[];
}

/**
 * Applies a career reading to the board: closes whatever it closed and opens the
 * next orders to fill the gaps. Pure, so the run-end path can diff the result
 * before and after to tell the player what they just finished.
 */
export function advanceContracts(state: ContractState, stats: ContractStats): ContractAdvance {
  const signedOff: string[] = [];
  const still: OpenContract[] = [];
  for (const open of state.active) {
    if (isContractMet(open, stats)) signedOff.push(open.id);
    else still.push(open);
  }
  const next = fillContractSlots({ active: still, completed: [...state.completed, ...signedOff] }, stats);
  return { state: next, signedOff };
}

/** What one open order shows on screen. */
export interface ContractView {
  id: string;
  name: string;
  requirement: string;
  /** Work done on this order, 0..target. */
  value: number;
  target: number;
  /** 0..1, for a progress bar. */
  progress: number;
}

export interface CompletedContractView {
  id: string;
  name: string;
  requirement: string;
}

export interface ContractBoard {
  active: ContractView[];
  completed: CompletedContractView[];
  total: number;
}

function viewOf(open: OpenContract, stats: ContractStats): ContractView | null {
  const contract = BY_ID.get(open.id);
  if (!contract) return null;
  const raw = contract.metric(stats);
  const value = contract.kind === "milestone" ? raw : raw - open.baseline;
  const done = Math.max(0, Math.min(contract.target, value));
  return {
    id: contract.id,
    name: contract.name,
    requirement: contract.requirement,
    value: done,
    target: contract.target,
    progress: contract.target <= 0 ? 1 : done / contract.target
  };
}

/** The board as the HUD and the profile want to draw it. */
export function contractBoard(state: ContractState, stats: ContractStats): ContractBoard {
  const active = state.active
    .map((open) => viewOf(open, stats))
    .filter((view): view is ContractView => view !== null);
  const completed = state.completed
    .map((id) => BY_ID.get(id))
    .filter((contract): contract is Contract => contract !== undefined)
    .map((contract) => ({ id: contract.id, name: contract.name, requirement: contract.requirement }));
  return { active, completed, total: CONTRACTS.length };
}

/** Name line for a signed-off order, for the run summary and the feed. */
export function contractName(id: string): string {
  return BY_ID.get(id)?.name ?? id.toUpperCase();
}
