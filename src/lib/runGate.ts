import { execConfig } from "./execConfig";

export type AcquireResult = "ok" | "busy" | "user-busy";

interface GateState {
  active: number;
  byOwner: Map<string, number>;
}

const GATE_KEY = "__outputtracerRunGate";

function state(): GateState {
  const globalState = globalThis as typeof globalThis & { [GATE_KEY]?: GateState };
  if (!globalState[GATE_KEY]) {
    globalState[GATE_KEY] = { active: 0, byOwner: new Map() };
  }
  return globalState[GATE_KEY];
}

export function tryAcquireRun(ownerKey?: string): AcquireResult {
  const gate = state();
  if (ownerKey && (gate.byOwner.get(ownerKey) ?? 0) >= 1) return "user-busy";
  if (gate.active >= execConfig.maxConcurrentRuns) return "busy";
  gate.active += 1;
  if (ownerKey) gate.byOwner.set(ownerKey, (gate.byOwner.get(ownerKey) ?? 0) + 1);
  return "ok";
}

export function releaseRun(ownerKey?: string): void {
  const gate = state();
  gate.active = Math.max(0, gate.active - 1);
  if (!ownerKey) return;
  const next = (gate.byOwner.get(ownerKey) ?? 1) - 1;
  if (next <= 0) gate.byOwner.delete(ownerKey);
  else gate.byOwner.set(ownerKey, next);
}

export function resetRunGate(): void {
  const gate = state();
  gate.active = 0;
  gate.byOwner.clear();
}

export function activeRunCount(): number {
  return state().active;
}
