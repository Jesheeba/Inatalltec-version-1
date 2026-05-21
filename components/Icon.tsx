// ============================================================
// Lucide-style icon set (ported verbatim from prototype/icons.jsx)
// Single component picks by name. Extra props (className, style) override.
// ============================================================

import type { CSSProperties } from "react";
import type { IconName } from "@/lib/types";

const ICON_PATHS: Record<string, string> = {
  dashboard:    "M3 12V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v7M3 12v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7M3 12h8M13 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M13 8v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8M13 8h8",
  feed:         "M3 5h18M3 12h18M3 19h12",
  calendar:     "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4",
  briefcase:    "M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18",
  wrench:       "M14.7 6.3a4 4 0 1 0-5.4 5.4l-6 6a2 2 0 0 0 2.8 2.8l6-6a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.3-2.3z",
  shield:       "M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z",
  shieldCheck:  "M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5zM9 12l2 2 4-4",
  users:        "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  user:         "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  cog:          "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  bell:         "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  search:       "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  package:      "M16.5 9.4 7.5 4.21M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
  truck:        "M5 17h14M3 17V7a2 2 0 0 1 2-2h9v12M14 8h4l3 4v5h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  fileText:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  receipt:      "M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2zM8 9h8M8 13h6",
  chartBar:     "M3 3v18h18M7 16V8M12 16V4M17 16v-6",
  chartLine:    "M3 3v18h18M7 14l4-4 4 4 5-7",
  pieChart:     "M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z",
  inbox:        "M22 12h-6l-2 3h-4l-2-3H2M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
  messageCircle:"M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z",
  check:        "M20 6 9 17l-5-5",
  checkCircle:  "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
  clock:        "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  alertCircle:  "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01",
  alertTriangle:"M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  zap:          "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  flame:        "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14.46-4 2-4-.5 1-.5 2 0 3 1 2 3 2 3 5a5 5 0 0 1-10 0c0-.5 0-1.5.5-2",
  pause:        "M6 4h4v16H6zM14 4h4v16h-4z",
  play:         "M5 3l14 9-14 9z",
  loader:       "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
  plus:         "M12 5v14M5 12h14",
  minus:        "M5 12h14",
  x:            "M18 6 6 18M6 6l12 12",
  filter:       "M22 3H2l8 9.46V19l4 2v-8.54z",
  arrowRight:   "M5 12h14M13 5l7 7-7 7",
  arrowLeft:    "M19 12H5M12 19l-7-7 7-7",
  arrowUp:      "M12 19V5M5 12l7-7 7 7",
  arrowDown:    "M12 5v14M19 12l-7 7-7-7",
  chevronRight: "M9 18l6-6-6-6",
  chevronLeft:  "M15 18l-6-6 6-6",
  chevronDown:  "M6 9l6 6 6-6",
  chevronUp:    "M18 15l-6-6-6 6",
  ellipsis:     "M5 12h.01M12 12h.01M19 12h.01",
  externalLink: "M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5",
  mapPin:       "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  navigation:   "M3 11l19-9-9 19-2-8-8-2z",
  camera:       "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  scan:         "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10",
  mic:          "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8",
  phone:        "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7a2 2 0 0 1 1.72 2.03z",
  mail:         "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7",
  pen:          "M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z",
  paperclip:    "M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.38A2 2 0 1 1 6.58 14.55l8.49-8.49",
  hardHat:      "M2 18h20M4 18a8 8 0 0 1 16 0M12 4a4 4 0 0 0-4 4v2h8V8a4 4 0 0 0-4-4z",
  camera2:      "M3 7h4l2-3h6l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
  cable:        "M4 9a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h2M4 13v8M22 15a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2h-2M22 11V3M9 9V3h6v6M9 9h6M9 9c-4 0-4 6 0 6h6c4 0 4-6 0-6",
  signature:    "M3 17.5C5 18 8 18 10 16s2.5-7 5-7c1.5 0 2 2 1.5 4-1 4 .5 4 2 4 2 0 3.5-.5 4.5-1.5M2 20h20",
  building:     "M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",
  banknote:     "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01",
  trendingUp:   "M22 7 13.5 15.5l-5-5L2 17M16 7h6v6",
  trendingDown: "M22 17 13.5 8.5l-5 5L2 7M16 17h6v-6",
  layers:       "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  list:         "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  grid:         "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  refresh:      "M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M3 21v-5h5M21 3v5h-5",
  star:         "M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  thumbsUp:     "M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z",
  warehouse:    "M22 12V8a2 2 0 0 0-1.2-1.83l-8-3.6a2 2 0 0 0-1.6 0l-8 3.6A2 2 0 0 0 2 8v4M22 12v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8M6 14v8M6 14h12M18 14v8",
  flag:         "M4 22V4M4 4s1-1 4-1 5 2 8 2 4-1 4-1v12s-1 1-4 1-5-2-8-2-4 1-4 1",
  cloudOff:     "M22 17a5 5 0 0 0-5-5h-1.26a8 8 0 0 0-7.05-3M19 16.95A6 6 0 0 1 13 22H7a5 5 0 0 1-2-9.66M1 1l22 22",
  trash:        "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  eye:          "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff:       "M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20",
  panelLeft:    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18",
};

interface IconProps {
  name: IconName | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size, className, style, strokeWidth }: IconProps) {
  const d = ICON_PATHS[name];
  const baseStyle = size ? { width: size, height: size, ...(style || {}) } : style;
  if (!d) {
    return (
      <svg width={size || 18} height={size || 18} viewBox="0 0 24 24"
        className={"lucide " + (className || "")}
        style={baseStyle} stroke="currentColor" fill="none" strokeWidth={strokeWidth || 1.5}
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
      </svg>
    );
  }
  return (
    <svg width={size || undefined} height={size || undefined} viewBox="0 0 24 24"
      className={"lucide " + (className || "")}
      style={baseStyle}
      stroke="currentColor" fill="none"
      strokeWidth={strokeWidth || 1.5}
      strokeLinecap="round" strokeLinejoin="round">
      {d.split("M").slice(1).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}
