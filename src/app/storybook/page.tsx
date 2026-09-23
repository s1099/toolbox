import type { Metadata } from "next";
import { Showcase } from "./showcase";

// Internal component gallery. Deliberately absent from the sidebar, search and
// nav, so it is only reachable by typing the URL.
export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Storybook · Toolbox",
};

export default function StorybookPage() {
  return <Showcase />;
}
