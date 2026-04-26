# Capacitor Preparation Plan

Quantixy should stay web-first until the mobile browser battle experience is stable. The current app is safe to wrap later, but a full Capacitor migration should wait until these items are complete.

## Before Installing Capacitor

- Confirm the PWA manifest, icons, theme color, safe-area layout, and loading state behave correctly on iPhone Safari and Android Chrome.
- Keep all Supabase, Stripe, and Socket.IO configuration environment-driven so the same build can target web, staging, and native shells.
- Decide the production app URL that the native shell will load, or whether a static exported bundle is feasible. The current Next.js/Supabase/Stripe setup is simplest as a hosted web app inside Capacitor.
- Add a mobile QA checklist for login, matchmaking, reconnects, Stripe cosmetic purchase redirects, audio unlock, background/foreground resume, and safe-area rendering.

## Suggested First Native Pass

- Install Capacitor only after browser QA passes: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, and `@capacitor/android`.
- Configure `capacitor.config.ts` with the hosted production URL first. Move to bundled assets only if server-rendered routes and Stripe redirects are accounted for.
- Add App Store privacy notes for Supabase auth identifiers, gameplay profiles, Stripe payment redirection, and analytics if any are added later.
- Test native lifecycle behavior: app suspend/resume should disconnect or reconnect Socket.IO cleanly without duplicate listeners.
