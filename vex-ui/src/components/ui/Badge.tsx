const EMPTY: Record<string, string> = {};

/**
 * Renders a status/workflow/publication-state pill: looks the value up in a
 * color map (from src/lib/vex/badges.ts) and formats SNAKE_CASE as words.
 */
export function Badge({ value, colors }: { value: string; colors?: Record<string, string> }) {
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${(colors ?? EMPTY)[value] ?? ""}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
