import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Primitivas visuais do portal. Um único painel, um único cartão de indicador e
 * um único estado vazio para todas as telas: o que distingue uma área da outra
 * é o conteúdo, nunca a moldura.
 */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("panel overflow-hidden", className)}>{children}</section>;
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale/60 text-rvd-plum">
            <Icon className="size-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: "neutral" | "brand" | "wait" | "go" | "stop";
}) {
  const tones = {
    neutral: "bg-state-done-bg text-state-done",
    brand: "bg-rvd-plum-pale/60 text-rvd-plum",
    wait: "bg-state-wait-bg text-state-wait",
    go: "bg-state-go-bg text-state-go",
    stop: "bg-state-stop-bg text-state-stop",
  } as const;

  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow max-w-[11rem] leading-4">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-6 font-display text-3xl font-extrabold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-soft">{hint}</p>}
    </article>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-canvas text-ink-faint">
        <Icon className="size-6" />
      </span>
      <p className="mt-4 font-display text-base font-extrabold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Grupo de filtros mutuamente exclusivos, com contador opcional por opção. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1 rounded-xl bg-canvas p-1", className)}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold transition",
              active ? "bg-surface text-rvd-plum shadow-sm" : "text-ink-soft hover:text-ink"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums",
                  active ? "bg-rvd-plum-pale/70 text-rvd-plum" : "bg-line/70 text-ink-soft"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function FieldShell({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

/** Estilo único de campo — inputs, selects e textareas ficam iguais. */
export const fieldClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-rvd-plum disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint";

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-canvas">
          <tr className="[&>th]:px-5 [&>th]:py-3 [&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.1em] [&>th]:text-ink-faint sm:[&>th]:px-6">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
