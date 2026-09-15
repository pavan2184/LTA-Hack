import { redirectSandboxSection } from "@/lib/navigation/sandbox-redirect";

export default function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return redirectSandboxSection("conflicts", searchParams);
}
