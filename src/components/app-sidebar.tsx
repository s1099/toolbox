"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarActions } from "@/components/sidebar-actions";
import { ToolboxLogo } from "@/components/toolbox-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { categories } from "@/lib/nav";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-12 justify-center">
        <div className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ToolboxLogo aria-hidden="true" className="size-[18px]" />
          </div>
          <span className="truncate font-heading font-semibold text-base tracking-tight group-data-[collapsible=icon]:hidden">
            Toolbox
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {categories.map((category) => (
          <SidebarGroup key={category.name}>
            <SidebarGroupLabel>{category.name}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {category.tools.map((tool) => (
                  <SidebarMenuItem key={tool.href}>
                    <SidebarMenuButton
                      isActive={pathname === tool.href}
                      render={<Link href={tool.href} />}
                      tooltip={tool.name}
                    >
                      <HugeiconsIcon icon={tool.icon} strokeWidth={2} />
                      <span>{tool.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarActions />
      </SidebarFooter>
    </Sidebar>
  );
}
