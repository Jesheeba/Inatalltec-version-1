"use client";
// Browser-side Supabase client. Uses the publishable key (RLS enforced).
//
// SINGLETON — every call returns the same client instance.
//
// Why: each `createBrowserClient` constructs an independent client with
// its own `auth`, `realtime`, and HTTP subclients. The realtime socket
// (and the JWT applied to it) lives on the instance. If consumers each
// create their own client, they each have their own anonymous realtime
// socket; only the FIRST instance to fire `auth.onAuthStateChange` ever
// gets the JWT applied to its socket, and other instances stay anonymous
// — so their channel joins evaluate RLS with `auth.uid() = NULL` and
// silently drop every event. (That was the Slice N1 realtime-delivery
// failure.)
//
// Sharing one client means: one socket, one JWT, every consumer sees the
// same authenticated realtime state. Also reduces wasted sockets and
// matches Supabase's documented best practice for browser apps.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseBrowser() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }
  return _client;
}
