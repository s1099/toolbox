"use client";

import {
  Add01Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Logout01Icon,
  Mail01Icon,
  Search01Icon,
  Settings01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SECTIONS = [
  { id: "button", name: "Button" },
  { id: "card", name: "Card" },
  { id: "input", name: "Input" },
  { id: "textarea", name: "Textarea" },
  { id: "input-group", name: "Input group" },
  { id: "combobox", name: "Combobox" },
  { id: "breadcrumb", name: "Breadcrumb" },
  { id: "separator", name: "Separator" },
  { id: "skeleton", name: "Skeleton" },
  { id: "tooltip", name: "Tooltip" },
  { id: "dropdown-menu", name: "Dropdown menu" },
  { id: "context-menu", name: "Context menu" },
  { id: "dialog", name: "Dialog" },
  { id: "sheet", name: "Sheet" },
  { id: "command", name: "Command" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;

const ICON_BUTTON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const SHEET_SIDES = ["top", "right", "bottom", "left"] as const;

const FRAMEWORKS = [
  "Next.js",
  "Remix",
  "Astro",
  "SvelteKit",
  "Nuxt",
  "SolidStart",
];

function Section({
  id,
  description,
  children,
}: {
  id: SectionId;
  description?: string;
  children: ReactNode;
}) {
  const name = SECTIONS.find((section) => section.id === id)?.name;
  return (
    <section className="flex scroll-mt-4 flex-col gap-3" id={id}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-semibold text-lg tracking-tight">
          {name}
        </h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-surface">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function ButtonShowcase() {
  return (
    <>
      <Row label="variant">
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </Row>
      <Row label="size">
        {BUTTON_SIZES.map((size) => (
          <Button key={size} size={size} variant="outline">
            {size}
          </Button>
        ))}
      </Row>
      <Row label="icon sizes">
        {ICON_BUTTON_SIZES.map((size) => (
          <Button aria-label={size} key={size} size={size} variant="outline">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </Button>
        ))}
      </Row>
      <Row label="with icon / disabled">
        <Button>
          <HugeiconsIcon
            data-icon="inline-start"
            icon={Download01Icon}
            strokeWidth={2}
          />
          Download
        </Button>
        <Button variant="destructive">
          <HugeiconsIcon
            data-icon="inline-start"
            icon={Delete02Icon}
            strokeWidth={2}
          />
          Delete
        </Button>
        <Button disabled>Disabled</Button>
        <Button disabled variant="outline">
          Disabled
        </Button>
      </Row>
    </>
  );
}

function CardShowcase() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Card title</CardTitle>
          <CardDescription>Header, action, content and footer.</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline">
              Action
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          Cards group related content. The footer gets a muted background and a
          top border.
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost">Cancel</Button>
          <Button>Save</Button>
        </CardFooter>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Small card</CardTitle>
          <CardDescription>
            size=&quot;sm&quot; tightens spacing.
          </CardDescription>
        </CardHeader>
        <CardContent>Content only, no footer.</CardContent>
      </Card>
    </div>
  );
}

function InputShowcase() {
  return (
    <div className="grid max-w-sm gap-3">
      <Input aria-label="Default input" placeholder="Default" />
      <Input aria-label="Email input" placeholder="Email" type="email" />
      <Input aria-label="File input" type="file" />
      <Input aria-invalid aria-label="Invalid input" defaultValue="Invalid" />
      <Input aria-label="Disabled input" disabled placeholder="Disabled" />
    </div>
  );
}

function TextareaShowcase() {
  return (
    <div className="grid max-w-sm gap-3">
      <Textarea
        aria-label="Default textarea"
        placeholder="Grows with content"
      />
      <Textarea
        aria-invalid
        aria-label="Invalid textarea"
        defaultValue="Invalid"
      />
      <Textarea
        aria-label="Disabled textarea"
        disabled
        placeholder="Disabled"
      />
    </div>
  );
}

function InputGroupShowcase() {
  return (
    <div className="grid max-w-sm gap-3">
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput aria-label="Search" placeholder="Search..." />
        <InputGroupAddon align="inline-end">
          <InputGroupText>12 results</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="URL" placeholder="example.com" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Copy" size="icon-xs">
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea
          aria-label="Message"
          placeholder="Write a message"
        />
        <InputGroupAddon align="block-end">
          <InputGroupText>0 / 280</InputGroupText>
          <InputGroupButton className="ml-auto" size="sm" variant="default">
            Send
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function ComboboxChipsDemo() {
  const anchor = useComboboxAnchor();
  return (
    <Combobox defaultValue={[FRAMEWORKS[0]]} items={FRAMEWORKS} multiple>
      <ComboboxChips className="max-w-sm" ref={anchor}>
        <ComboboxValue>
          {(values: string[]) => (
            <>
              {values.map((value) => (
                <ComboboxChip key={value}>{value}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label="Frameworks"
                placeholder="Add framework"
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function ComboboxShowcase() {
  return (
    <>
      <Row label="single">
        <Combobox items={FRAMEWORKS}>
          <ComboboxInput
            aria-label="Framework"
            className="w-64"
            placeholder="Pick a framework"
            showClear
          />
          <ComboboxContent>
            <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Row>
      <Row label="multiple (chips)">
        <ComboboxChipsDemo />
      </Row>
    </>
  );
}

function BreadcrumbShowcase() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#breadcrumb">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#breadcrumb">Image</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>OCR</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function SeparatorShowcase() {
  return (
    <div className="flex max-w-sm flex-col gap-3 text-sm">
      <span>Above</span>
      <Separator />
      <div className="flex h-5 items-center gap-3">
        <span>Left</span>
        <Separator orientation="vertical" />
        <span>Middle</span>
        <Separator orientation="vertical" />
        <span>Right</span>
      </div>
    </div>
  );
}

function SkeletonShowcase() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

function TooltipShowcase() {
  return (
    <div className="flex flex-wrap gap-2">
      {SHEET_SIDES.map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger render={<Button variant="outline" />}>
            {side}
          </TooltipTrigger>
          <TooltipContent side={side}>Tooltip on {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function DropdownMenuShowcase() {
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [position, setPosition] = useState("bottom");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="w-fit" variant="outline" />}
      >
        Open menu
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuItem>
            <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
            Profile
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
            Settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
              Invite
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Email</DropdownMenuItem>
              <DropdownMenuItem>Message</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={showStatusBar}
            onCheckedChange={setShowStatusBar}
          >
            Status bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showPanel}
            onCheckedChange={setShowPanel}
          >
            Panel
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Panel position</DropdownMenuLabel>
          <DropdownMenuRadioGroup onValueChange={setPosition} value={position}>
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContextMenuShowcase() {
  const [showGrid, setShowGrid] = useState(true);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
        Right-click (or long-press) here
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuGroup>
          <ContextMenuLabel>Actions</ContextMenuLabel>
          <ContextMenuItem>
            Back
            <ContextMenuShortcut>⌘[</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            Reload
            <ContextMenuShortcut>⌘R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>More tools</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Save page</ContextMenuItem>
              <ContextMenuItem>Developer tools</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem
          checked={showGrid}
          onCheckedChange={setShowGrid}
        >
          Show grid
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DialogShowcase() {
  return (
    <Dialog>
      <DialogTrigger render={<Button className="w-fit" variant="outline" />}>
        Open dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription>
            Give the file a new name. This does not change its contents.
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="File name" defaultValue="scan-001.png" />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetShowcase() {
  return (
    <div className="flex flex-wrap gap-2">
      {SHEET_SIDES.map((side) => (
        <Sheet key={side}>
          <SheetTrigger render={<Button variant="outline" />}>
            {side}
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>Sheet from {side}</SheetTitle>
              <SheetDescription>
                Panels slide in from any edge of the screen.
              </SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <SheetClose render={<Button />}>Done</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  );
}

function CommandItems() {
  return (
    <>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Suggestions">
        <CommandItem>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          Search files
        </CommandItem>
        <CommandItem>
          <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
          Download
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Settings">
        <CommandItem>
          <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
          Profile
          <CommandShortcut>⌘P</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
          Settings
          <CommandShortcut>⌘S</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </>
  );
}

function CommandShowcase() {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);

  return (
    <>
      <Row label="inline">
        <Command className="max-w-sm rounded-lg border">
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandItems />
          </CommandList>
        </Command>
      </Row>
      <Row label="dialog">
        <Button onClick={openDialog} variant="outline">
          Open command dialog
        </Button>
        <CommandDialog onOpenChange={setOpen} open={open}>
          <Command>
            <CommandInput placeholder="Type a command..." />
            <CommandList>
              <CommandItems />
            </CommandList>
          </Command>
        </CommandDialog>
      </Row>
    </>
  );
}

export function Showcase() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 p-6">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading font-semibold text-2xl">Storybook</h1>
          <nav aria-label="Components" className="flex flex-wrap gap-1.5">
            {SECTIONS.map((section) => (
              <Button
                key={section.id}
                nativeButton={false}
                render={<a href={`#${section.id}`} />}
                size="xs"
                variant="secondary"
              >
                {section.name}
              </Button>
            ))}
          </nav>
        </header>

        <Section id="button">
          <ButtonShowcase />
        </Section>
        <Section id="card">
          <CardShowcase />
        </Section>
        <Section id="input">
          <InputShowcase />
        </Section>
        <Section id="textarea">
          <TextareaShowcase />
        </Section>
        <Section id="input-group">
          <InputGroupShowcase />
        </Section>
        <Section id="combobox">
          <ComboboxShowcase />
        </Section>
        <Section id="breadcrumb">
          <BreadcrumbShowcase />
        </Section>
        <Section id="separator">
          <SeparatorShowcase />
        </Section>
        <Section id="skeleton">
          <SkeletonShowcase />
        </Section>
        <Section id="tooltip">
          <TooltipShowcase />
        </Section>
        <Section id="dropdown-menu">
          <DropdownMenuShowcase />
        </Section>
        <Section id="context-menu">
          <ContextMenuShowcase />
        </Section>
        <Section id="dialog">
          <DialogShowcase />
        </Section>
        <Section id="sheet">
          <SheetShowcase />
        </Section>
        <Section
          description="The same component that powers Ctrl K search in the header."
          id="command"
        >
          <CommandShowcase />
        </Section>
      </div>
    </div>
  );
}
