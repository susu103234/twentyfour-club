import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}

export function GlassPanel({ children, className = "", elevated }: Props) {
  return (
    <div
      className={`glass ${elevated ? "glass-hi" : ""} rounded-2xl ${className}`}
    >
      {children}
    </div>
  );
}
