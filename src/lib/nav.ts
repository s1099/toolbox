import {
  AudioWave01Icon,
  Image01Icon,
  ScanImageIcon,
  SubtitleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface Tool {
  description: string;
  href: string;
  icon: IconSvgElement;
  name: string;
}

export interface Category {
  icon: IconSvgElement;
  name: string;
  tools: Tool[];
}

export const categories: Category[] = [
  {
    icon: Image01Icon,
    name: "Image",
    tools: [
      {
        description: "Pull text out of screenshots, photos and scans.",
        href: "/image/ocr",
        icon: ScanImageIcon,
        name: "OCR",
      },
    ],
  },
  {
    icon: AudioWave01Icon,
    name: "Audio",
    tools: [
      {
        description: "Turn recordings and audio files into text.",
        href: "/audio/transcript",
        icon: SubtitleIcon,
        name: "Transcript",
      },
    ],
  },
];

export function findTool(pathname: string) {
  for (const category of categories) {
    const tool = category.tools.find((t) => t.href === pathname);
    if (tool) {
      return { category, tool };
    }
  }
  return null;
}
