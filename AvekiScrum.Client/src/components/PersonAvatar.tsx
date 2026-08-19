import { useState } from "react";
import { matchPersonImage } from "./personImages";
import "./PersonAvatar.css";

interface PersonAvatarProps {
  name: string | null | undefined;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic accent color per person, drawn from the Aveki palette, so the same
// name always renders the same color across boards (used as the initials fallback).
const PALETTE = [
  "var(--aveki-orange)",
  "var(--aveki-blue)",
  "var(--aveki-green)",
  "var(--aveki-blue-tint-2)",
  "var(--aveki-orange-tint-2)",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function PersonAvatar({ name, size = 32 }: PersonAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const displayName = name?.trim() || "Ej tilldelad";
  const isUnassigned = !name?.trim();
  const imageUrl = isUnassigned ? null : matchPersonImage(displayName);

  if (imageUrl && !imgFailed) {
    return (
      <img
        className="person-avatar person-avatar--photo"
        src={imageUrl}
        alt={displayName}
        title={displayName}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className="person-avatar"
      title={displayName}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.4),
        background: isUnassigned ? "var(--color-border)" : colorFor(displayName),
      }}
    >
      {isUnassigned ? "?" : initials(displayName)}
    </span>
  );
}
