interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: "accent" | "success" | "warning" | "danger" | "info";
  subtitle?: string;
}

const colorStyles = {
  accent: "text-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-[var(--color-accent)]/20",
  success: "text-[var(--color-success)] bg-[var(--color-success)]/10 ring-[var(--color-success)]/20",
  warning: "text-[var(--color-warning)] bg-[var(--color-warning)]/10 ring-[var(--color-warning)]/20",
  danger: "text-[var(--color-danger)] bg-[var(--color-danger)]/10 ring-[var(--color-danger)]/20",
  info: "text-[var(--color-info)] bg-[var(--color-info)]/10 ring-[var(--color-info)]/20",
};

export function StatsCard({ title, value, icon, color = "accent", subtitle }: StatsCardProps) {
  return (
    <div className="card-hover group flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ${colorStyles[color]} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground mt-1 tabular-nums">{value}</p>
        </div>
      </div>
      {subtitle && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
