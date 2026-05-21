"use client";
// ============================================================
// LoadingSplash - full-viewport overlay shown during initial
// page load and slow route transitions. Renders the app favicon
// in the centre with a gentle pop-in + pulse animation.
// Visibility logic:
//   - shown immediately on mount, hidden on window 'load'
//   - shown when an internal <a> click hasn't resolved within
//     NAV_THRESHOLD ms (skips instant transitions)
//   - hidden when usePathname() changes (route landed)
//   - respects MIN_MS so it never flickers, MAX_MS so it can't hang
// ============================================================

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const MIN_MS = 300;
const MAX_MS = 5000;
const NAV_THRESHOLD = 200;

export function LoadingSplash() {
  const pathname = usePathname();
  const [show, setShow] = useState(true);
  const shownAt = useRef<number>(Date.now());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNav = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialised = useRef(false);

  const startShow = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (maxTimer.current) clearTimeout(maxTimer.current);
    shownAt.current = Date.now();
    setShow(true);
    maxTimer.current = setTimeout(() => setShow(false), MAX_MS);
  };

  const startHide = () => {
    const elapsed = Date.now() - shownAt.current;
    const wait = Math.max(0, MIN_MS - elapsed);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShow(false);
      if (maxTimer.current) { clearTimeout(maxTimer.current); maxTimer.current = null; }
    }, wait);
  };

  useEffect(() => {
    maxTimer.current = setTimeout(() => setShow(false), MAX_MS);
    const onLoad = () => startHide();
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (maxTimer.current) clearTimeout(maxTimer.current);
      if (pendingNav.current) clearTimeout(pendingNav.current);
    };
  }, []);

  useEffect(() => {
    if (!initialised.current) { initialised.current = true; return; }
    if (pendingNav.current) { clearTimeout(pendingNav.current); pendingNav.current = null; }
    startHide();
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest("a") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      if (pendingNav.current) clearTimeout(pendingNav.current);
      pendingNav.current = setTimeout(() => { startShow(); }, NAV_THRESHOLD);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!show) return null;
  return (
    <div className="loading-splash" role="status" aria-label="Loading">
      <img src="/icon.png" alt="" className="loading-splash-logo" />
    </div>
  );
}
