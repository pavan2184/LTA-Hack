import { AlertTriangle, CircleCheck, CircleDot, Siren } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export type DashboardStatus = "Draft" | "Conflicts detected" | "Optimised" | "Disruption detected";

export function StatusBadge({ status }: { status: DashboardStatus }) {
  const config = {
    Draft: { variant: "neutral" as const, icon: CircleDot, label: "Not loaded" },
    "Conflicts detected": { variant: "danger" as const, icon: AlertTriangle, label: "Needs action" },
    Optimised: { variant: "success" as const, icon: CircleCheck, label: "Ready for review" },
    "Disruption detected": { variant: "danger" as const, icon: Siren, label: "Replan required" },
  }[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="h-7 px-2.5">
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}
