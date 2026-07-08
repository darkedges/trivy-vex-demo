/** A definition-list row: muted fixed-width label + truncating value. */
export function DetailRow({
  label,
  value,
  mono,
  labelWidth = "w-32",
}: {
  label: string;
  value: string;
  mono?: boolean;
  labelWidth?: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className={`text-muted-foreground ${labelWidth} flex-shrink-0`}>{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
