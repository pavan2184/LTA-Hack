import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  NotificationConfiguration,
  NotificationDelivery,
} from "@railplan/core/types/notifications";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { PlanNotifications } from "@/components/notifications/PlanNotifications";

const delivery: NotificationDelivery = {
  id: "delivery-1",
  organisationId: "org-1",
  organisationName: "Alpha contractor",
  planId: "plan-1",
  planningNight: "2026-09-16",
  kind: "publication",
  messageText: "Plan plan-1 · Alpha work only · Non-operational prototype",
  deduplicationKey: "plan-1:org-1",
  status: "failed",
  ambiguous: false,
  inFlight: false,
  attemptCount: 1,
  telegramMessageId: null,
  errorCode: "missing_credentials",
  errorMessage: "Telegram bot is not configured.",
  nextRetryAt: null,
  createdAt: "2026-09-07T00:00:00Z",
  lastAttemptAt: "2026-09-07T00:00:00Z",
  sentAt: null,
  attempts: [],
};
const configuration: NotificationConfiguration = {
  organisationId: "org-1",
  organisationName: "Alpha contractor",
  chatId: null,
  version: 0,
  updatedAt: null,
  updatedBy: null,
  lastTest: null,
};
afterEach(() => vi.unstubAllGlobals());
describe("Telegram configuration", () => {
  it("saves a numeric destination with its version without sending, then explicitly tests the saved version", async () => {
    const calls: { url: string; body: unknown; method: string | undefined }[] =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!init?.method)
          return Response.json({
            configurations: [configuration],
            botConfigured: true,
          });
        calls.push({
          url,
          body: JSON.parse(String(init.body)),
          method: init.method,
        });
        return Response.json(
          url.endsWith("/test")
            ? {
                delivery: {
                  ...delivery,
                  kind: "test",
                  planId: null,
                  status: "sent",
                  telegramMessageId: "123",
                  errorCode: null,
                  errorMessage: null,
                },
              }
            : {
                configuration: {
                  ...configuration,
                  chatId: "-100123",
                  version: 1,
                },
              },
        );
      }),
    );
    render(<NotificationSettings />);
    const user = userEvent.setup();
    const card = await screen.findByRole("region", {
      name: "Telegram for Alpha contractor",
    });
    await user.type(within(card).getByLabelText("Telegram chat ID"), "-100123");
    expect(
      within(card).getByRole("button", { name: "Send test message" }),
    ).toBeDisabled();
    await user.click(
      within(card).getByRole("button", { name: "Save destination" }),
    );
    await within(card).findByText(/Destination saved/);
    expect(calls).toEqual([
      {
        url: "/api/notifications/configurations/org-1",
        method: "PUT",
        body: { expectedVersion: 0, chatId: "-100123" },
      },
    ]);
    await user.click(
      within(card).getByRole("button", { name: "Send test message" }),
    );
    expect(
      await within(card).findByText(/Telegram message ID: 123/),
    ).toBeInTheDocument();
    expect(calls[1].body).toEqual({ expectedVersion: 1 });
  });
  it("shows missing bot configuration and a durable failed test without claiming it was sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          configurations: [
            {
              ...configuration,
              chatId: "-100123",
              version: 1,
              lastTest: { ...delivery, kind: "test" },
            },
          ],
          botConfigured: false,
        }),
      ),
    );
    render(<NotificationSettings />);
    expect(
      await screen.findByText(/Bot credentials are not configured/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Telegram bot is not configured."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send test message" }),
    ).toBeDisabled();
  });
  it("retains edited destination after a version conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method
          ? Response.json(
              { error: { message: "Configuration changed. Reload settings." } },
              { status: 409 },
            )
          : Response.json({
              configurations: [configuration],
              botConfigured: true,
            }),
      ),
    );
    render(<NotificationSettings />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Telegram chat ID"),
      "-100999",
    );
    await user.click(screen.getByRole("button", { name: "Save destination" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Configuration changed",
    );
    expect(screen.getByLabelText("Telegram chat ID")).toHaveValue("-100999");
  });
});
describe("published plan deliveries", () => {
  it("requires explicit duplicate-risk acknowledgement before retrying an ambiguous outcome", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method)
          return Response.json({
            deliveries: [
              {
                ...delivery,
                ambiguous: true,
                errorCode: "timeout",
                errorMessage: "Outcome unknown.",
              },
            ],
          });
        calls.push(JSON.parse(String(init.body)));
        return Response.json({
          delivery: {
            ...delivery,
            status: "sent",
            telegramMessageId: "456",
            errorMessage: null,
            errorCode: null,
          },
        });
      }),
    );
    render(<PlanNotifications planId="plan-1" publishState="published" />);
    const user = userEvent.setup();
    const retry = await screen.findByRole("button", { name: "Retry delivery" });
    expect(retry).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", { name: /may send a duplicate/ }),
    );
    await user.click(retry);
    expect(
      await screen.findByText(/Telegram message ID: 456/),
    ).toBeInTheDocument();
    expect(calls).toEqual([{ acknowledgeDuplicateRisk: true }]);
    expect(
      screen.queryByRole("button", { name: "Retry delivery" }),
    ).not.toBeInTheDocument();
  });
  it("shows message and audit history while preventing sent, active and superseded resends", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          deliveries: [
            {
              ...delivery,
              status: "sent",
              telegramMessageId: "123",
              errorMessage: null,
              attempts: [
                {
                  id: "a1",
                  number: 1,
                  actorId: "planner",
                  chatId: "-100123",
                  startedAt: delivery.createdAt,
                  finishedAt: delivery.createdAt,
                  status: "sent",
                  telegramMessageId: "123",
                  errorCode: null,
                  errorMessage: null,
                  ambiguous: false,
                },
              ],
            },
            { ...delivery, id: "delivery-2", inFlight: true },
          ],
        }),
      ),
    );
    const { rerender } = render(
      <PlanNotifications planId="plan-1" publishState="published" />,
    );
    expect((await screen.findAllByText(delivery.messageText)).length).toBe(2);
    expect(
      screen.queryByRole("button", { name: "Retry delivery" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Delivery attempt in progress/),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getAllByText(/Delivery attempts/)[0]);
    expect(screen.getByText(/Actor planner/)).toBeInTheDocument();
    rerender(<PlanNotifications planId="plan-1" publishState="superseded" />);
    expect(
      await screen.findByText(/Historical delivery records/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry delivery" }),
    ).not.toBeInTheDocument();
  });
  it("does not let a late previous-plan response replace the selected plan's deliveries", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("plan-1")
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(
              Response.json({
                deliveries: [
                  {
                    ...delivery,
                    id: "second",
                    planId: "plan-2",
                    messageText: "Second plan only",
                  },
                ],
              }),
            ),
      ),
    );
    const { rerender } = render(
      <PlanNotifications planId="plan-1" publishState="published" />,
    );
    rerender(<PlanNotifications planId="plan-2" publishState="published" />);
    await screen.findByText("Second plan only");
    await act(async () => {
      finish(Response.json({ deliveries: [delivery] }));
    });
    expect(screen.getByText("Second plan only")).toBeInTheDocument();
    expect(screen.queryByText(delivery.messageText)).not.toBeInTheDocument();
  });
  it("explains no affected organisations and shows delivery failures independently of publication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ deliveries: [] })),
    );
    const { rerender } = render(
      <PlanNotifications planId="empty" publishState="published" />,
    );
    expect(
      await screen.findByText(/No contractor notifications were created/),
    ).toBeInTheDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ deliveries: [delivery] })),
    );
    rerender(<PlanNotifications planId="failed" publishState="published" />);
    expect(
      await screen.findByText("Telegram bot is not configured."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Delivery failures do not undo publication/),
    ).toBeInTheDocument();
  });
});

it("requires refreshing after a provider retry window before enabling retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        deliveries: [
          {
            ...delivery,
            errorCode: "rate_limited",
            nextRetryAt: "2099-01-01T00:00:00Z",
          },
        ],
      }),
    ),
  );
  render(<PlanNotifications planId="plan-1" publishState="published" />);
  expect(
    await screen.findByRole("button", { name: "Retry delivery" }),
  ).toBeDisabled();
  expect(screen.getByText(/Retry available after 2099/)).toBeInTheDocument();
});

it("does not start another test while the last test still has an active claim", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        configurations: [
          {
            ...configuration,
            chatId: "-100123",
            version: 1,
            lastTest: { ...delivery, kind: "test", inFlight: true },
          },
        ],
        botConfigured: true,
      }),
    ),
  );
  render(<NotificationSettings />);
  expect(
    await screen.findByRole("button", { name: "Send test message" }),
  ).toBeDisabled();
});

it("does not attach an old destination's retry result after a new destination is saved", async () => {
  let finishRetry!: (response: Response) => void;
  const oldTest = {
    ...delivery,
    kind: "test",
    planId: null,
    messageText: "Old destination test",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/retry"))
        return new Promise<Response>((resolve) => {
          finishRetry = resolve;
        });
      if (init?.method === "PUT")
        return Promise.resolve(
          Response.json({
            configuration: {
              ...configuration,
              chatId: "-100222",
              version: 2,
              lastTest: null,
            },
          }),
        );
      return Promise.resolve(
        Response.json({
          configurations: [
            {
              ...configuration,
              chatId: "-100111",
              version: 1,
              lastTest: oldTest,
            },
          ],
          botConfigured: true,
        }),
      );
    }),
  );
  render(<NotificationSettings />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Retry delivery" }),
  );
  await user.clear(screen.getByLabelText("Telegram chat ID"));
  await user.type(screen.getByLabelText("Telegram chat ID"), "-100222");
  await user.click(screen.getByRole("button", { name: "Save destination" }));
  await screen.findByText(/Destination saved/);
  expect(screen.queryByText("Old destination test")).not.toBeInTheDocument();
  await act(async () => {
    finishRetry(
      Response.json({
        delivery: {
          ...oldTest,
          status: "sent",
          attemptCount: 2,
          telegramMessageId: "old-chat-message",
          errorCode: null,
          errorMessage: null,
        },
      }),
    );
  });
  expect(screen.getByLabelText("Telegram chat ID")).toHaveValue("-100222");
  expect(screen.getByText(/Version 2/)).toBeInTheDocument();
  expect(screen.queryByText("Old destination test")).not.toBeInTheDocument();
  expect(screen.queryByText(/old-chat-message/)).not.toBeInTheDocument();
});
