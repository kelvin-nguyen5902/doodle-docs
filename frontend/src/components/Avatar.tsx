const PEER_COLORS = ["#c2410c", "#2f6fed", "#7c3aed", "#0f766e", "#b07a1a", "#9d174d"];

export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
}

interface AvatarProps {
  label: string;
  color: string;
  size?: number;
  ring?: string;
  overlap?: boolean;
  title?: string;
}

export function Avatar({ label, color, size = 28, ring = "var(--card)", overlap, title }: AvatarProps) {
  return (
    <div
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: color,
        color: "var(--card)",
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 500,
        flex: "none",
        boxShadow: `0 0 0 2px ${ring}`,
        marginRight: overlap ? -6 : 0,
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </div>
  );
}
