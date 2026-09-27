import type { ReactNode } from "react";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "error" | "neutral" | "info";

export function StatusChip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={cn("status-chip", `status-${tone}`)}>
      <span className="status-dot" />
      {children}
    </span>
  );
}

export function Banner({
  tone,
  children,
  onClose,
}: {
  tone: Exclude<Tone, "neutral">;
  children: ReactNode;
  onClose?: () => void;
}) {
  const Icon = tone === "success" ? Check : AlertTriangle;
  return (
    <div className={cn("banner", `banner-${tone}`)} role="status">
      <Icon className="size-4 shrink-0" />
      <p>{children}</p>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Dismiss message">
          <X />
        </Button>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div className="min-w-0">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {trailing}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
}) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <p className="eyebrow">Clinical operations</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && (
        <Button size="lg" onClick={onAction}>
          <Plus />
          {action}
        </Button>
      )}
    </div>
  );
}
