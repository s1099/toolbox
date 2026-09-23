import type { SVGProps } from "react";

export function ToolboxLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>Toolbox</title>
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <rect height="13" rx="2.5" width="18" x="3" y="7" />
      <path d="M3 12h7M14 12h7" />
      <path d="M10 11h4v2.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1Z" />
    </svg>
  );
}
