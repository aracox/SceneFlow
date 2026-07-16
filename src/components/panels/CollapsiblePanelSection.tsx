import { useEffect, useRef, useState, type ReactNode } from 'react';

interface CollapsiblePanelSectionProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  focusKey?: string | number | null;
}

export default function CollapsiblePanelSection({
  title,
  subtitle,
  actions,
  children,
  defaultOpen = true,
  focusKey,
}: CollapsiblePanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement | null>(null);
  const initialFocusKey = useRef(focusKey);

  useEffect(() => {
    if (focusKey === undefined || focusKey === null || focusKey === initialFocusKey.current) return;
    setOpen(true);
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [focusKey]);

  return (
    <section ref={sectionRef} className="border-b border-white/40 p-[18px]">
      <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-white/60 bg-white/78 px-3 py-2 shadow-sm ring-1 ring-white/35">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span
            className={`mt-0.5 text-[12px] text-slate-400 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          >
            &gt;
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium uppercase tracking-wide text-slate-500">
              {title}
            </span>
            {subtitle && (
              <span className="mt-0.5 block truncate text-[11px] leading-4 text-slate-400">
                {subtitle}
              </span>
            )}
          </span>
        </button>
        {actions && (
          <div onClick={(event) => event.stopPropagation()} className="shrink-0">
            {actions}
          </div>
        )}
      </div>
      {open && children}
    </section>
  );
}
