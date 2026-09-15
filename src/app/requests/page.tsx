import { RequestWorkspacePage, type RequestQuery } from "@/components/requests/RequestWorkspacePage";
export default function RequestReviewPage({ searchParams }: { searchParams: Promise<RequestQuery> }) {
  return RequestWorkspacePage({ role: "planner", searchParams });
}
