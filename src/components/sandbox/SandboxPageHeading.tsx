export function SandboxPageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="border border-rule bg-surface px-3 py-2.5">
      <h2 className="text-[14px] font-semibold text-ink-900">{title}</h2>
      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
        {description}
      </p>
    </header>
  );
}
