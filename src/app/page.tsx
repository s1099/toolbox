import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { categories } from "@/lib/nav";

export default function Home() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8 lg:px-12">
        <h1 className="font-heading font-semibold text-2xl">Toolbox</h1>

        {categories.map((category) => (
          <section className="flex flex-col gap-3" key={category.name}>
            <h2 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
              <HugeiconsIcon
                className="size-4"
                icon={category.icon}
                strokeWidth={2}
              />
              {category.name}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {category.tools.map((tool) => (
                <li key={tool.href}>
                  <Link
                    className="group/tool block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    href={tool.href}
                  >
                    <Card className="h-full transition-colors group-hover/tool:bg-muted/50">
                      <CardHeader>
                        <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                          <HugeiconsIcon
                            className="size-5"
                            icon={tool.icon}
                            strokeWidth={2}
                          />
                        </div>
                        <CardTitle>{tool.name}</CardTitle>
                        <CardDescription>{tool.description}</CardDescription>
                        <CardAction>
                          <HugeiconsIcon
                            className="size-4 text-muted-foreground transition-transform group-hover/tool:translate-x-0.5 group-hover/tool:text-foreground"
                            icon={ArrowRight01Icon}
                            strokeWidth={2}
                          />
                        </CardAction>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
