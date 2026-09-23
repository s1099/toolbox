"use client";

import {
  Moon02Icon,
  MoreHorizontalIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import invertocat from "../../public/GitHub_Invertocat_Black.svg";

const REPO_URL = "https://github.com/s1099/toolbox";

/**
 * Imported rather than referenced by URL: the site is served under a basePath,
 * which next/image does not prefix onto an unoptimized src, so "/GitHub_…svg"
 * would 404. The import carries the built URL and the mark's own dimensions.
 * It ships solid black, hence the flip for dark mode.
 */
function GithubMark() {
  return (
    <Image
      alt=""
      className="h-4 w-auto shrink-0 dark:invert"
      src={invertocat}
    />
  );
}

/**
 * Which face shows is left to CSS: the prerendered HTML is built long before
 * anyone's theme is known, but next-themes puts the class on <html> ahead of
 * first paint, so the right icon is the one already painted — no state, no
 * mismatch to correct, and nothing to swap after mount.
 */
const THEME_ICON = {
  dark: "hidden dark:block",
  light: "dark:hidden",
} as const;

export function SidebarActions() {
  const { resolvedTheme, setTheme } = useTheme();

  // resolvedTheme is only read on click, by which point the client has long
  // since resolved it.
  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    // next-themes swaps the class from an effect, so the update has to be
    // flushed inside the callback — the browser captures the "after" state the
    // moment it returns, and a state update still in React's queue would miss it.
    const apply = () => flushSync(() => setTheme(next));

    if ("startViewTransition" in document) {
      document.startViewTransition(apply);
      return;
    }
    apply();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
        <Button
          render={<a href={REPO_URL} rel="noopener" target="_blank" />}
          size="icon"
          variant="ghost"
        >
          <GithubMark />
          <span className="sr-only">GitHub repository</span>
        </Button>
        <Button onClick={toggleTheme} size="icon" variant="ghost">
          <HugeiconsIcon
            className={THEME_ICON.light}
            icon={Moon02Icon}
            strokeWidth={2}
          />
          <HugeiconsIcon
            className={THEME_ICON.dark}
            icon={Sun03Icon}
            strokeWidth={2}
          />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </SidebarMenuItem>

      {/* Collapsed, the two buttons don't fit side by side, so they become a
          menu behind the one slot the rail does have. */}
      <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton />}>
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            <span className="sr-only">More</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40" side="right">
            <DropdownMenuItem
              render={<a href={REPO_URL} rel="noopener" target="_blank" />}
            >
              <GithubMark />
              Source code
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleTheme}>
              <HugeiconsIcon
                className={THEME_ICON.light}
                icon={Moon02Icon}
                strokeWidth={2}
              />
              <HugeiconsIcon
                className={THEME_ICON.dark}
                icon={Sun03Icon}
                strokeWidth={2}
              />
              Theme
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
