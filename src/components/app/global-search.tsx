"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const commandSearch = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slashSearch = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!commandSearch && (!slashSearch || isEditableTarget(event.target))) return;
      event.preventDefault();
      inputRef.current?.focus();
    }

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <form action="/app/search" method="get" role="search" className="relative w-full max-w-xl">
      <label htmlFor="global-operator-search" className="sr-only">Search your workspace</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        id="global-operator-search"
        name="q"
        type="search"
        minLength={2}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
        aria-keyshortcuts="/ Control+K Meta+K"
        placeholder="Search names or references"
        className="h-9 bg-background pr-15 pl-9"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
        ⌘/Ctrl K
      </kbd>
    </form>
  );
}
