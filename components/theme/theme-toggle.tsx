"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeMode } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-8 items-center rounded-lg border border-border bg-card p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTheme(option.value)}
            aria-label={`Use ${option.label.toLowerCase()} theme`}
            title={option.label}
            className={cn(
              "h-7 w-7 rounded-md px-0",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </Button>
        );
      })}
    </div>
  );
}
