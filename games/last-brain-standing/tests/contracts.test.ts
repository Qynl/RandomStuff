import { describe, expect, it } from "vitest";
import { emptyKindTotals } from "../src/ai";
import {
  advanceContracts,
  CONTRACT_IDS,
  CONTRACT_SLOTS,
  CONTRACTS,
  contractBoard,
  contractName,
  emptyContractState,
  fillContractSlots,
  isContractMet,
  normalizeContractState,
  type ContractState,
  type ContractStats
} from "../src/contracts";

/** A career reading, starting from a brand new account and overridable per test. */
function stats(overrides: Partial<ContractStats> = {}): ContractStats {
  return {
    runs: 0,
    kills: 0,
    careerScore: 0,
    bestCombo: 0,
    interrupts: 0,
    perfectVictories: 0,
    victories: 0,
    unlocks: 6,
    classesFlown: 0,
    arenasCleared: [],
    levelsCleared: [],
    bestAccuracy: 0,
    killsByKind: emptyKindTotals(),
    deathsByKind: emptyKindTotals(),
    ...overrides
  };
}

describe("contract board data", () => {
  it("keeps every order nameable, unique and satisfiable", () => {
    const ids = CONTRACTS.map((contract) => contract.id);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONTRACT_IDS).toEqual(ids);
    for (const contract of CONTRACTS) {
      expect(contract.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(contract.name.length).toBeGreaterThan(0);
      expect(contract.requirement.length).toBeGreaterThan(8);
      expect(contract.target).toBeGreaterThan(0);
      // A metric that throws or returns nonsense on an empty career would take
      // the run-end path down with it, so every one is read here.
      const reading = contract.metric(stats());
      expect(Number.isFinite(reading)).toBe(true);
      expect(reading).toBeGreaterThanOrEqual(0);
    }
    expect(contractName("spotter")).toBe("SPOTTER");
  });

  it("leaves a career the work to do", () => {
    // Nothing on the board may already be true for a fresh account, or the
    // first three orders would sign themselves off before the player moves.
    for (const contract of CONTRACTS) {
      expect(contract.metric(stats())).toBeLessThan(contract.target);
    }
  });
});

describe("contract state repair", () => {
  it("drops what it cannot name and keeps what it can", () => {
    const repaired = normalizeContractState({
      active: [
        { id: "spotter", baseline: 3 },
        { id: "nonsense", baseline: 0 },
        { id: "spotter", baseline: 9 },
        { id: "first-contact", baseline: "banana" }
      ],
      completed: ["field-test", "field-test", "not-a-contract", 42]
    });
    expect(repaired.active).toEqual([
      { id: "spotter", baseline: 3 },
      { id: "first-contact", baseline: 0 }
    ]);
    expect(repaired.completed).toEqual(["field-test"]);
  });

  it("never leaves an order open and signed off at the same time", () => {
    const repaired = normalizeContractState({
      active: [{ id: "spotter", baseline: 0 }],
      completed: ["spotter"]
    });
    expect(repaired.active).toEqual([]);
    expect(repaired.completed).toEqual(["spotter"]);
  });

  it("survives junk from storage", () => {
    for (const junk of [null, undefined, 7, "contracts", [], { active: "no", completed: 5 }]) {
      expect(normalizeContractState(junk)).toEqual(emptyContractState());
    }
  });
});

describe("opening orders", () => {
  it("opens a full board from the head of the list", () => {
    const filled = fillContractSlots(emptyContractState(), stats());
    expect(filled.active.map((open) => open.id)).toEqual(CONTRACT_IDS.slice(0, CONTRACT_SLOTS));
    expect(filled.completed).toEqual([]);
  });

  it("signs off a milestone the career had already passed instead of handing it out", () => {
    // A player who has already won without damage never gets "win without
    // damage" as a task: when the board reaches it, it is signed off and the
    // queue moves on. Everything before it is already finished here.
    const before = CONTRACT_IDS.slice(0, CONTRACT_IDS.indexOf("clean-sheet"));
    const filled = fillContractSlots(
      { active: [], completed: [...before] },
      stats({ perfectVictories: 1, levelsCleared: ["veteran"] })
    );
    expect(filled.completed).toContain("clean-sheet");
    expect(filled.completed).toContain("veteran-order");
    // The three slots went to the orders after the skipped ones, in board order.
    expect(filled.active.map((open) => open.id)).toEqual(["gunsmith", "centurion", "full-sweep"]);
  });

  it("stops cleanly once the queue runs out, however good the career is", () => {
    // A career that has done everything: milestones sign themselves off, the
    // count orders still ask for more work, and the board never loops or
    // double-books an order.
    const done = stats({
      runs: 500,
      kills: 900,
      interrupts: 200,
      bestCombo: 20,
      perfectVictories: 3,
      victories: 40,
      classesFlown: 6,
      bestAccuracy: 92,
      arenasCleared: ["QUADRANT", "LANES", "PILLARS"],
      levelsCleared: ["recruit", "standard", "veteran"],
      killsByKind: { ...emptyKindTotals(), sniper: 40, shard: 90, shielder: 20, mortar: 20, pyro: 20, charger: 20 }
    });
    const filled = fillContractSlots(emptyContractState(), done);
    // Count orders are still work to do, so the board stays full; what matters
    // is that it never books the same order twice or loops looking for a slot.
    expect(filled.active.length).toBe(CONTRACT_SLOTS);
    expect(filled.active.map((open) => open.id)).toEqual(["first-contact", "field-test", "spotter"]);
    const overlap = filled.active.filter((open) => filled.completed.includes(open.id));
    expect(overlap).toEqual([]);
    // Re-reading the same career must not change the board or duplicate ids.
    const again = fillContractSlots(filled, done);
    expect(again.active).toEqual(filled.active);
    expect(again.completed).toEqual(filled.completed);
    const view = contractBoard(filled, done);
    expect(new Set(view.completed.map((entry) => entry.id)).size).toBe(view.completed.length);
  });
});

describe("closing orders", () => {
  it("counts work done from the moment the order was opened", () => {
    const before = stats({ kills: 100 });
    const board = fillContractSlots(emptyContractState(), before);
    // The baseline is captured at opening, so kills already banked do not count.
    const openedField = board.active.find((open) => open.id === "field-test");
    expect(openedField?.baseline).toBe(100);
    const mid = advanceContracts(board, stats({ kills: 110 }));
    expect(mid.signedOff).toEqual([]);
    expect(mid.state.active.some((open) => open.id === "field-test")).toBe(true);
    const done = advanceContracts(mid.state, stats({ kills: 126 }));
    expect(done.signedOff).toEqual(["field-test"]);
    expect(done.state.completed).toContain("field-test");
  });

  it("reads a milestone absolutely, however long ago it was earned", () => {
    const board: ContractState = { active: [{ id: "chain-reaction", baseline: 0 }], completed: [] };
    expect(isContractMet(board.active[0], stats({ bestCombo: 5 }))).toBe(false);
    expect(isContractMet(board.active[0], stats({ bestCombo: 6 }))).toBe(true);
  });

  it("opens the next order in the slot an order just freed", () => {
    const board: ContractState = {
      active: [
        { id: "field-test", baseline: 0 },
        { id: "spotter", baseline: 0 },
        { id: "pest-control", baseline: 0 }
      ],
      // The queue is contiguous: everything ahead of these three is done.
      completed: ["first-contact"]
    };
    const advanced = advanceContracts(board, stats({ kills: 25 }));
    expect(advanced.signedOff).toEqual(["field-test"]);
    expect(advanced.state.active.map((open) => open.id)).toEqual(["spotter", "pest-control", "wind-up-cutter"]);
    expect(advanced.state.active.length).toBe(CONTRACT_SLOTS);
  });

  it("takes the head of the queue when a newer order frees a slot", () => {
    // Orders are handed out in board order, so a gap in the middle is filled by
    // whatever is next in line behind the head, not by what comes after the
    // order that just closed.
    const advanced = advanceContracts(
      { active: [{ id: "counterbattery", baseline: 0 }], completed: [] },
      stats({ killsByKind: { ...emptyKindTotals(), mortar: 4 } })
    );
    expect(advanced.signedOff).toEqual(["counterbattery"]);
    expect(advanced.state.active.map((open) => open.id)).toEqual(["first-contact", "field-test", "spotter"]);
  });

  it("closes several orders in one reading, in board order", () => {
    const board: ContractState = {
      active: [
        { id: "spotter", baseline: 0 },
        { id: "wall-breaker", baseline: 0 },
        { id: "counterbattery", baseline: 0 }
      ],
      completed: []
    };
    const advanced = advanceContracts(
      board,
      stats({ killsByKind: { ...emptyKindTotals(), sniper: 6, shielder: 5, mortar: 4 } })
    );
    expect(advanced.signedOff).toEqual(["spotter", "wall-breaker", "counterbattery"]);
    expect(advanced.state.completed).toEqual(expect.arrayContaining(["spotter", "wall-breaker", "counterbattery"]));
  });
});

describe("the board as the UI draws it", () => {
  it("shows progress within an order, clamped to what it asks for", () => {
    const board = fillContractSlots(emptyContractState(), stats());
    const view = contractBoard(board, stats({ runs: 1 }));
    const first = view.active.find((entry) => entry.id === "first-contact");
    expect(first?.value).toBe(1);
    expect(first?.target).toBe(3);
    expect(first?.progress).toBeCloseTo(1 / 3, 5);

    const overshot = contractBoard(board, stats({ runs: 99 })).active.find((entry) => entry.id === "first-contact");
    expect(overshot?.value).toBe(3);
    expect(overshot?.progress).toBe(1);
  });

  it("lists signed-off orders with their wording, in the order they were closed", () => {
    const board = advanceContracts(fillContractSlots(emptyContractState(), stats()), stats({ runs: 3 })).state;
    const view = contractBoard(board, stats({ runs: 3 }));
    expect(view.completed.map((entry) => entry.id)).toContain("first-contact");
    expect(view.completed[0].requirement).toBe("Finish 3 runs");
    expect(view.total).toBe(CONTRACTS.length);
    expect(view.active.length).toBe(CONTRACT_SLOTS);
  });

  it("forgets an order it cannot name rather than throwing", () => {
    const board: ContractState = { active: [{ id: "ghost-order", baseline: 0 }], completed: ["phantom"] };
    const view = contractBoard(board, stats());
    expect(view.active).toEqual([]);
    expect(view.completed).toEqual([]);
  });
});
