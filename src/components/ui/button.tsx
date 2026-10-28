"use client";

import type { ButtonHTMLAttributes, Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon" | "icon-sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-canvas shadow-[0_0_0_1px_rgb(56_189_248/0.4),0_8px_24px_-8px_rgb(56_189_248/0.6)] hover:bg-sky-300",
  secondary: "border border-line bg-raised text-ink hover:border-line-strong hover:bg-[#1a2335]",
  ghost: "text-ink-muted hover:bg-raised hover:text-ink",
  danger: "text-ink-muted hover:bg-red-500/10 hover:text-danger",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  icon: "h-9 w-9",
  "icon-sm": "h-7 w-7",
};

/** Base button. Defaults to `type="button"` so it never submits forms. */
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
