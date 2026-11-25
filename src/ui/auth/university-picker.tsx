"use client";

// The university field: type a few letters (or a short form like NUST) and pick from the HEC
// list. A student whose university is not listed can keep what they typed; the admin sees it
// and can merge it into a listed university or add it. The database makes the final match
// (src/ui/auth/university-search.ts explains how), so typing "air uni" and submitting without
// picking still saves "Air University".
//
// A standard ARIA combobox: arrow keys move through the suggestions, Enter picks, Escape closes.
import { useId, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { exactUniversity, searchUniversities, type University } from "./university-search";

export function UniversityPicker({
  universities, label, name, defaultValue = "", error, maxLength, idName, allowUnlisted = true, compact = false,
}: {
  universities: University[]; label: string; name: string; defaultValue?: string; error?: string; maxLength?: number;
  /** Also submit the picked university's id under this name ("" when none is picked). */
  idName?: string;
  /** Offer "keep what I typed" for a university that is not listed. */
  allowUnlisted?: boolean;
  compact?: boolean;
}) {
  const base = useId();
  // Same id scheme as the other form fields (f-<name>), except for the small admin pickers.
  const inputId = compact ? `${base}-input` : `f-${name}`;
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = useMemo(() => searchUniversities(universities, value), [universities, value]);
  const exact = useMemo(() => exactUniversity(universities, value), [universities, value]);
  const showUnlisted = allowUnlisted && value.trim().length >= 2 && !exact;
  const options = [...matches.map((u) => ({ kind: "uni" as const, u })), ...(showUnlisted ? [{ kind: "unlisted" as const }] : [])];
  const expanded = open && options.length > 0;

  const pick = (i: number) => {
    const o = options[i];
    if (o?.kind === "uni") setValue(o.u.name);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (options.length ? (a + d + options.length) % options.length : -1));
    } else if (e.key === "Enter" && expanded && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const hintId = `${base}-hint`;
  const hint = error ? null
    : exact ? <span className="flex items-center gap-1 text-success"><Check size={12} aria-hidden /> Saved as {exact.name}</span>
    : value.trim().length >= 2 && allowUnlisted ? <span>Not in the list yet. It is saved as you typed it, and an admin matches it later.</span>
    : allowUnlisted ? <span>Start typing, or use a short form like NUST or FAST.</span> : null;

  return (
    <div className={compact ? "relative" : "relative mb-4"} data-university-picker>
      <label htmlFor={inputId} className={compact ? "sr-only" : "mb-1.5 block text-sm font-semibold"}>{label}</label>
      <input
        id={inputId} name={name} value={value} maxLength={maxLength} required autoComplete="off" spellCheck={false}
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${base}-list`}
        aria-activedescendant={expanded && active >= 0 ? `${base}-opt-${active}` : undefined}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-err` : hint ? hintId : undefined}
        placeholder={compact ? "Search the list…" : undefined}
        onChange={(e) => { setValue(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border-2 border-card-border bg-background px-3 py-2.5 text-base outline-none transition-colors focus:border-accent aria-invalid:border-danger sm:text-sm lg:py-2"
      />
      {idName && <input type="hidden" name={idName} value={exact ? String(exact.id) : ""} />}
      {expanded && (
        <ul id={`${base}-list`} role="listbox" aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border-2 border-card-border bg-card p-1 shadow-xl">
          {options.map((o, i) => (
            <li
              key={o.kind === "uni" ? o.u.id : "unlisted"} id={`${base}-opt-${i}`} role="option" aria-selected={i === active}
              data-university-option={o.kind === "uni" ? o.u.name : undefined} data-university-unlisted={o.kind === "unlisted" || undefined}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer rounded-md px-3 py-2.5 text-sm lg:py-2 ${i === active ? "bg-accent/15 text-foreground" : "text-muted-foreground"}`}
            >
              {o.kind === "uni" ? (
                <>
                  <span className="text-foreground">{o.u.name}</span>
                  {o.u.aliases[0] && <span className="ml-2 font-mono text-xs text-muted">{o.u.aliases[0]}</span>}
                </>
              ) : (
                <span>Keep &ldquo;{value.trim()}&rdquo; · my university isn&rsquo;t listed</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error ? <p id={`${inputId}-err`} className="mt-1 text-xs text-danger" data-field-error={name}>{error}</p>
        : hint ? <p id={hintId} className="mt-1 text-xs text-muted-foreground" data-university-hint>{hint}</p> : null}
    </div>
  );
}
