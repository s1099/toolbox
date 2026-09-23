"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { categories, findTool } from "@/lib/nav";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const match = findTool(pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <Separator
        className="data-vertical:h-4 data-vertical:self-center"
        orientation="vertical"
      />
      <Breadcrumb>
        <BreadcrumbList>
          {match ? (
            <>
              <BreadcrumbItem>{match.category.name}</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{match.tool.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>Home</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <Button
        className="ml-auto w-56 justify-start text-muted-foreground max-md:w-[11.2rem]"
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        Search...
        <kbd className="ml-auto text-xs tracking-widest max-md:hidden">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog onOpenChange={setOpen} open={open}>
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No tools found.</CommandEmpty>
            {categories.map((category) => (
              <CommandGroup heading={category.name} key={category.name}>
                {category.tools.map((tool) => (
                  <CommandItem
                    key={tool.href}
                    onSelect={() => {
                      setOpen(false);
                      router.push(tool.href);
                    }}
                    value={`${category.name} ${tool.name}`}
                  >
                    <HugeiconsIcon icon={tool.icon} strokeWidth={2} />
                    {tool.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}
