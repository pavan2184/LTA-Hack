import { RequestWorkspacePage, type RequestQuery } from "@/components/requests/RequestWorkspacePage";
export default function Contractor({ searchParams }: { searchParams: Promise<RequestQuery> }) {
  return RequestWorkspacePage({ role: "contractor", searchParams });
}
