import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SavedPlansWorkspace } from '@/components/plans/SavedPlansWorkspace';
import { solve } from '@railplan/core/engine/solve';

// Notification HTTP behavior and publish integration have their own real-component suites.
vi.mock('@/components/notifications/PlanNotifications', () => ({ PlanNotifications: () => null }));
vi.mock('@/components/notifications/NotificationSettings', () => ({ NotificationSettings: () => null }));
vi.mock('@/components/plans/ContractorResponses', () => ({ ContractorResponses: () => null }));

const result = solve({ strategy: 'balanced' });
const saved = {
  id: '6c494154-2b92-4890-8b8a-8a522254fe42', planningNight: '2026-09-16',
  sourceRevision: '1', inputDigest: 'sha256:test', strategy: 'balanced',
  solverVersion: result.solverVersion, constraintVersion: result.constraintVersion,
  status: result.status, objectives: result.objective, metrics: result.metrics,
  validation: { independentlyValidated: true, violations: [] },
  placements: result.plan.placements, deferred: result.plan.deferred,
  createdBy: 'planner-id', createdAt: '2026-09-07T07:30:00Z',
  publishState: 'draft', publishedAt: null, supersededBy: null,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('creates a durable server version and displays its saved placements and provenance', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ plans: [] })).mockResolvedValueOnce(json({ plan: saved }, 201));
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await screen.findByText('No saved versions for this night.');
  await user.click(screen.getByRole('button', { name: 'Generate and save plan' }));
  await screen.findByText(saved.id);
  expect(screen.getByText(saved.inputDigest)).toBeInTheDocument();
  await user.click(screen.getByText("Technical record and review notes"));
  expect(screen.getByRole('table', { name: 'Saved placements' })).toBeInTheDocument();
  const [, options] = fetcher.mock.calls[1];
  expect(JSON.parse(options.body)).toEqual({ planningNight: '2026-09-16', strategy: 'balanced', locked: [] });
});

it('keeps the saved plan visible and explains stale publication instead of claiming success', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ plans: [saved] })).mockResolvedValueOnce(json({ plan: saved }))
    .mockResolvedValueOnce(json({ error: { code: 'stale_plan', message: 'Source changed. Generate a new plan.' } }, 409));
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await user.click(screen.getByText(/^Version history/));
  await user.click(await screen.findByRole('button', { name: /Open version/ }));
  await user.click(await screen.findByRole('button', { name: 'Publish this version' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Source changed. Generate a new plan.'));
  expect(screen.getByText(saved.id)).toBeInTheDocument();
  expect(screen.queryByText('Plan published.')).not.toBeInTheDocument();
});

it('shows a recoverable load error without presenting an empty saved history as success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
  render(<SavedPlansWorkspace />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach RailPlan');
  expect(screen.queryByText('No saved versions for this night.')).not.toBeInTheDocument();
});

it('renders published versions read-only and records review notes separately', async () => {
  const published = { ...saved, publishState: 'published', publishedAt: '2026-09-07T07:35:00Z' };
  const fetcher = vi.fn().mockResolvedValueOnce(json({ plans: [published] }))
    .mockResolvedValueOnce(json({ plan: published })).mockResolvedValueOnce(json({ decision: { id: 'decision-id' } }, 201));
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await user.click(screen.getByText(/^Version history/));
  await user.click(await screen.findByRole('button', { name: /Open version/ }));
  expect(await screen.findByRole('button', { name: 'Publish this version' })).toBeDisabled();
  await user.click(screen.getByText("Technical record and review notes"));
  await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Review recorded after publication.');
  await user.click(screen.getByRole('button', { name: 'Record decision' }));
  await screen.findByText('Decision recorded in the audit history.');
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ kind: 'note', reason: 'Review recorded after publication.' });
  expect(screen.getByText(saved.id)).toBeInTheDocument();
});

it('does not claim publication when another planner already superseded the selected version', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ plans: [saved] }))
    .mockResolvedValueOnce(json({ plan: saved }))
    .mockResolvedValueOnce(json({ plan: { ...saved, publishState: 'superseded', publishedAt: saved.createdAt, supersededBy: 'new-current-id' } })));
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await user.click(screen.getByText(/^Version history/));
  await user.click(await screen.findByRole('button', { name: /Open version/ }));
  await user.click(await screen.findByRole('button', { name: 'Publish this version' }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Plan operation status' })).toHaveTextContent('already been superseded'));
  expect(screen.queryByText('Plan published.')).not.toBeInTheDocument();
});

it('clears old-night versions when a different night fails to load', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ plans: [saved] })).mockRejectedValueOnce(new TypeError('network')));
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await user.click(screen.getByText(/^Version history/));
  await screen.findByRole('button', { name: /Open version/ });
  const date = screen.getByLabelText('Planning night');
  await user.clear(date);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /Open version/ })).not.toBeInTheDocument();
});

it('resumes the latest version when refreshing publication state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ plans: [saved] }))
    .mockResolvedValueOnce(json({ plan: saved })).mockResolvedValueOnce(json({ plans: [{ ...saved, publishState: 'superseded' }] })));
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await user.click(screen.getByText(/^Version history/));
  await user.click(await screen.findByRole('button', { name: /Open version/ }));
  await screen.findByRole('button', { name: 'Publish this version' });
  await user.click(screen.getByRole('button', { name: 'Refresh versions' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publish this version' })).toBeDisabled());
  expect(screen.getByText('This is an older published schedule')).toBeInTheDocument();
});

// Saved snapshot visuals have real-component and combined journey coverage.
vi.mock("@/components/plans/SavedPlanReview", () => ({ SavedPlanReview: () => null }));

it('resumes the latest schedule with technical detail folded away and a clear publication handoff', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ plans: [saved] })));
  render(<SavedPlansWorkspace />);
  await screen.findByText(`Schedule for ${saved.planningNight}`);
  expect(screen.getByText('Version history · 1 saved').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText('Technical record and review notes').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByRole('textbox', { name: 'Reason' })).not.toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Continue to publication ↓' }));
  expect(screen.getByRole('region', { name: 'Publish and notify' })).toHaveFocus();
});

it('keeps an unrecorded note bound to its version until explicitly discarded', async () => {
  const next = { ...saved, id: '6c494154-2b92-4890-8b8a-8a522254fe43' };
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async () => json({ plans: [reads++ ? next : saved] })));
  render(<SavedPlansWorkspace />);
  await screen.findByText(`Schedule for ${saved.planningNight}`);
  await userEvent.click(screen.getByText('Technical record and review notes'));
  await userEvent.selectOptions(screen.getByLabelText('Decision'), 'accept');
  await userEvent.type(screen.getByLabelText('Reason'), 'This note belongs to the original version');
  await userEvent.click(screen.getByText(/^Version history/));
  expect(screen.getByRole('button', { name: 'Refresh versions' })).toBeDisabled();
  expect(screen.getByLabelText('Planning night')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Discard review note' }));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh versions' }));
  await screen.findByText(next.id);
  await userEvent.click(screen.getByText('Technical record and review notes'));
  expect(screen.getByLabelText('Reason')).toHaveValue('');
  expect(screen.getByLabelText('Decision')).toHaveValue('note');
  expect(screen.getByRole('button', { name: 'Record decision' })).toBeDisabled();
});
