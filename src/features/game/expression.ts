/**
 * Safe arithmetic expression parser and evaluator.
 *
 * Supports: non-negative integers and decimals, + - * / × ÷, parentheses,
 * unary minus. No identifiers, no function calls, no `eval`.
 *
 * Returns the computed numeric value plus the list of numeric literals used,
 * which lets the game validate that the submission consumes exactly the hand.
 */

const DIGIT = /[0-9]/;

export interface ParseResult {
  value: number;
  numbers: number[];
}

export class ParseError extends Error {}

export function evaluateExpression(raw: string): ParseResult {
  const input = raw.replace(/×/g, "*").replace(/÷/g, "/");
  const numbers: number[] = [];
  let i = 0;

  function peek(): string {
    return input[i];
  }

  function skipWs() {
    while (i < input.length && /\s/.test(input[i])) i++;
  }

  function eat(ch: string): boolean {
    skipWs();
    if (input[i] === ch) {
      i++;
      return true;
    }
    return false;
  }

  function expect(ch: string) {
    if (!eat(ch)) throw new ParseError(`Expected '${ch}'`);
  }

  // expression := term (('+' | '-') term)*
  function parseExpression(): number {
    let value = parseTerm();
    skipWs();
    while (peek() === "+" || peek() === "-") {
      const op = input[i++];
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
      skipWs();
    }
    return value;
  }

  // term := factor (('*' | '/') factor)*
  function parseTerm(): number {
    let value = parseFactor();
    skipWs();
    while (peek() === "*" || peek() === "/") {
      const op = input[i++];
      const rhs = parseFactor();
      if (op === "/" && rhs === 0) throw new ParseError("Division by zero");
      value = op === "*" ? value * rhs : value / rhs;
      skipWs();
    }
    return value;
  }

  // factor := '-' factor | '(' expression ')' | number
  function parseFactor(): number {
    skipWs();
    if (eat("-")) return -parseFactor();
    if (eat("+")) return parseFactor();
    if (eat("(")) {
      const v = parseExpression();
      expect(")");
      return v;
    }
    return parseNumber();
  }

  function parseNumber(): number {
    skipWs();
    const start = i;
    while (i < input.length && DIGIT.test(input[i])) i++;
    if (input[i] === ".") {
      i++;
      while (i < input.length && DIGIT.test(input[i])) i++;
    }
    if (i === start) throw new ParseError("Expected a number");
    const n = Number(input.slice(start, i));
    if (!Number.isFinite(n)) throw new ParseError("Invalid number");
    numbers.push(n);
    return n;
  }

  const value = parseExpression();
  skipWs();
  if (i !== input.length) throw new ParseError("Unexpected trailing input");
  return { value, numbers };
}
