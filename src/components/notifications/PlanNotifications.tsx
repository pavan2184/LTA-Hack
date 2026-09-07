"use client";
import { useEffect, useState } from "react";
import type { NotificationDelivery } from "@railplan/core/types/notifications";
import type { PlanVersion } from "@railplan/core/types/plans";
import { DeliveryRecord, notificationButton } from "./DeliveryRecord";
import { notificationRequest } from "./notification-api";

type Props = {
  planId: string;
  publishState: PlanVersion["publishState"];
  warning?: string | null;
};
export function PlanNotifications(props: Props) {
  return props.publishState === "draft" ? (
    <p className="text-sm">
      Contractor notifications are created only when this version is published.
    </p>
  ) : (
    <DeliveryHistory key={`${props.planId}:${props.publishState}`} {...props} />
  );
}
function DeliveryHistory({ planId, publishState, warning }: Props) {
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    notificationRequest<{ deliveries: NotificationDelivery[] }>(
      `/api/plans/${planId}/notifications`,
    )
      .then((result) => {
        if (active) setDeliveries(result.deliveries);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Delivery history could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [planId, refresh]);
  return (
    <section
      aria-label="Plan notification deliveries"
      className="min-w-0 space-y-3 rounded border border-rule bg-surface p-4"
    >
      <h3 className="font-semibold">Contractor notifications</h3>
      <p className="text-sm">
        Delivery failures do not undo publication. Review the delivery status
        separately from the saved plan.
      </p>
      {warning && (
        <p role="alert" className="text-sm text-signal-red">
          {warning}
        </p>
      )}
      {publishState === "superseded" && (
        <p className="text-sm">
          Historical delivery records for a superseded plan. Sending this old
          schedule is disabled.
        </p>
      )}
      <button
        className={notificationButton}
        disabled={loading}
        onClick={() => {
          setLoading(true);
          setError("");
          setDeliveries([]);
          setRefresh((value) => value + 1);
        }}
      >
        Refresh delivery status
      </button>
      {loading && (
        <p role="status" className="text-sm">
          Loading delivery history…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-signal-red">
          {error}
        </p>
      )}
      {!loading && !error && !deliveries.length && (
        <p className="text-sm">
          {warning
            ? "No delivery records are available. Publication is still committed; an operator should check the notification warning."
            : "No contractor notifications were created for this version. There were no affected contractor organisations in the publication changes."}
        </p>
      )}
      {deliveries.map((delivery) => (
        <DeliveryRecord
          key={delivery.id}
          delivery={delivery}
          allowRetry={publishState === "published"}
          onUpdated={(updated) =>
            setDeliveries((current) =>
              current.map((row) => (row.id === updated.id ? updated : row)),
            )
          }
        />
      ))}
    </section>
  );
}
