import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "ghost" | "outline" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-white hover:opacity-90 border-transparent",
  ghost: "bg-transparent hover:bg-[var(--accent-soft)] border-transparent text-[var(--muted)]",
  outline: "bg-transparent border-[var(--border)] hover:bg-[var(--accent-soft)]",
  danger: "bg-transparent border-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "text-xs px-2.5 py-1.5" : "text-[13px] px-3.5 py-2",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
