import { useState, type ReactNode } from 'react';

interface CollapsiblePanelSectionProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function CollapsiblePanelSection({
  title,
  subtitle,
  actions,
  children,
  defaultOpen = true,
}: CollapsiblePanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-slate-100 p-[18px]">
      <div className="mb-2 flex items-start justify-between gap-3">
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
