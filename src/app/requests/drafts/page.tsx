import { RequestWorkspacePage, type RequestQuery } from "@/components/requests/RequestWorkspacePage";
export default function PlannerDrafts({ searchParams }: { searchParams: Promise<RequestQuery> }) {
  return RequestWorkspacePage({ role: "planner", drafts: true, searchParams });
}
