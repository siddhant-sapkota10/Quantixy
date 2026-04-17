"use client";

import { Fragment } from "react";

type MathExpressionProps = {
  text: string;
  className?: string;
};

function Fraction({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="mx-0.5 inline-flex flex-col items-center align-middle">
      <span className="px-0.5 leading-none">{top}</span>
      <span className="h-px w-full min-w-[1.1rem] bg-slate-300/80" />
      <span className="px-0.5 leading-none">{bottom}</span>
    </span>
  );
}

const SUPER_MAP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
  "+": "⁺",
  "(": "⁽",
  ")": "⁾",
};

function toSuperscript(value: string) {
  return value
    .split("")
    .map((ch) => SUPER_MAP[ch] ?? ch)
    .join("");
}

function normalizeMathText(input: string) {
  let out = String(input ?? "");

  // Normalize common textual tokens.
  out = out.replace(/\btheta\b/gi, "θ");

  // Convert power notation to superscript (x^2 -> x²).
  out = out.replace(/([A-Za-z0-9)\]])\^(-?\d+)/g, (_, base: string, exp: string) => {
    return `${base}${toSuperscript(exp)}`;
  });

  // Convert sqrt(...) to the radical symbol for cleaner display.
  // Repeat to handle nested roots in a simple deterministic way.
  for (let i = 0; i < 6; i += 1) {
    const next = out.replace(/sqrt\(([^()]+)\)/gi, "√($1)");
    if (next === out) break;
    out = next;
  }

  return out;
}

function renderToken(token: string, key: string) {
  if (!token) return null;

  const derivativeOperator = /^d\/d([A-Za-z])$/.exec(token);
  if (derivativeOperator) {
    return <Fraction key={key} top="d" bottom={`d${derivativeOperator[1]}`} />;
  }

  const derivativeRatio = /^d([A-Za-z])\/d([A-Za-z])$/.exec(token);
  if (derivativeRatio) {
    return <Fraction key={key} top={`d${derivativeRatio[1]}`} bottom={`d${derivativeRatio[2]}`} />;
  }

  const fracMatch = /^(-?\d+)\/(-?\d+)$/.exec(token);
  if (fracMatch) {
    return <Fraction key={key} top={fracMatch[1]} bottom={fracMatch[2]} />;
  }

  if (token === "x") return <span key={key}>×</span>;
  if (token === "*") return <span key={key}>×</span>;

  return <span key={key}>{token}</span>;
}

export function MathExpression({ text, className }: MathExpressionProps) {
  const normalized = normalizeMathText(String(text ?? ""));
  const parts = normalized
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (
    <span className={className}>
      {parts.map((token, idx) => (
        <Fragment key={`${token}-${idx}`}>
          {idx > 0 ? " " : null}
          {renderToken(token, `${token}-${idx}`)}
        </Fragment>
      ))}
    </span>
  );
}
