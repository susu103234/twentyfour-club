import { EPS } from "./constants";

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v - Math.round(v)) < EPS) return String(Math.round(v));
  return v.toFixed(2).replace(/\.?0+$/, "");
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function displayExpression(expr: string): string {
  return expr
    .replace(/\*/g, "×")
    .replace(/\//g, "÷")
    .replace(/\s+/g, " ")
    .trim();
}

export function toAsciiExpression(expr: string): string {
  return expr.replace(/×/g, "*").replace(/÷/g, "/");
}
