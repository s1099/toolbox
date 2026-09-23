import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom depth shadows from globals.css; registering them lets `cn` resolve
// conflicts like `shadow-surface` vs `shadow-none` instead of keeping both.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: [
        "raised",
        "raised-strong",
        "pressed",
        "well",
        "surface",
        "overlay",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
