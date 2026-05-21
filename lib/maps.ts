// Google Maps URL API - opens turn-by-turn directions in the user's Maps app
// (mobile) or maps.google.com (desktop). Free, no API key, no billing.
// https://developers.google.com/maps/documentation/urls/get-started

export interface NavDestination {
  name?: string;
  area?: string;
  lat?: number;
  lng?: number;
  query?: string;
}

export function buildDirectionsUrl(dest: NavDestination): string | null {
  let destination = "";
  if (dest.lat != null && dest.lng != null) {
    destination = `${dest.lat},${dest.lng}`;
  } else if (dest.query) {
    destination = dest.query;
  } else {
    destination = [dest.name, dest.area, "UAE"].filter(Boolean).join(", ");
  }
  if (!destination.trim()) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export function navigateTo(dest: NavDestination): boolean {
  const url = buildDirectionsUrl(dest);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
