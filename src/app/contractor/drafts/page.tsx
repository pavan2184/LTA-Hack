import { RequestWorkspacePage, type RequestQuery } from "@/components/requests/RequestWorkspacePage";
export default function ContractorDrafts({ searchParams }: { searchParams: Promise<RequestQuery> }) {
  return RequestWorkspacePage({ role: "contractor", drafts: true, searchParams });
}
