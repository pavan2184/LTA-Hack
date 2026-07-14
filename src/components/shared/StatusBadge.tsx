import { AlertTriangle, CircleCheck, CircleDot, Siren } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export type DashboardStatus = "Draft" | "Conflicts detected" | "Optimised" | "Disruption detected";

export function StatusBadge({ status }: { status: DashboardStatus }) {
  const config = {
    Draft: { variant: "neutral" as const, icon: CircleDot },
    "Conflicts detected": { variant: "danger" as const, icon: AlertTriangle },
    Optimised: { variant: "success" as const, icon: CircleCheck },
    "Disruption detected": { variant: "danger" as const, icon: Siren },
  }[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="h-7 px-2.5">
      <Icon className="size-3" />
      {status}
    </Badge>
  );
}
