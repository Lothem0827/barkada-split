# Tally — Bill Splitter (Next.js PWA + Supabase Edition)

Guide for AI coding agents working on this project. Read this before changing any files.

## What this is

Tally is a mobile-first Progressive Web App (Next.js App Router + TypeScript + Tailwind CSS + Supabase + Zustand) for splitting group trip expenses among friend groups. Core business logic (`barkada-split/lib/split-math.ts`) and the Zustand store (`barkada-split/lib/store.tsx`) stay framework-agnostic enough to port to Expo / React Native later. Display name is Tally; the mascot is Tally. Routes, storage keys, and repo paths still say barkada/lakad.

## Tech stack

- Next.js App Router, TypeScript (strict), Tailwind CSS, shadcn/ui.
- Zustand persist, localStorage key `barkada-split-v7` (migrates from v6 / v5).
- Supabase anonymous auth, optional Google link, Realtime on `lakads`.
- App works offline. Real trips sync when online. Demo seed trips never upload.

## Product rules

- First-launch users (`!onboarded`) go to `/onboarding`. Bottom nav is hidden there and on `/join/[code]`.
- `showTestTools` is false for real create/join, true for Explore Demo.
- One treasurer per trip. Treasurer approves/rejects, deletes, confirms payments, edits GCash, toggles `open`, hands off, and resets seat locks.
- `open` auto-approves expenses **and** allows “I'm not on the list” self-add on join.
- Payments: debtor/treasurer marks `sent`; recipient/treasurer confirms. Only confirmed payments change balances.
- No real money movement. Copy # / Copy ₱ only.
- Tone: English UI. Tali parinig lines (`lib/companion-ai.ts`) and singil / GCash reminder bodies (`lib/reminders.ts`) stay Taglish. Taglish/Bisaya UI is deferred.

## Data model

All money is integer centavos. Format only at display with `peso()`.

- `Member`: `id`, `name`, `gcash`, optional `claimedByUid`
- `Trip`: `id`, `joinCode` (`ELYU-26`), `name`, `treasurer`, `gcash`, `open`, `roundTo`, `members`, `expenses`, `payments`
- PIN hashes live in `seat_locks` / local `pinHashes`, never in shared snapshots

## Routes

- `/` lakad list
- `/onboarding` first-launch wizard
- `/join/[code]` visual seat claim
- `/lakad/[id]` live trip tabs
- `/auth/callback` Google PKCE return

## Invite + claim

Treasurer taps Invite Barkada → `navigator.share` of `/join/<joinCode>` (clipboard fallback).
Join page fetches preview by `join_code`, shows seat grid, GCash + optional PIN, then binds `claimedByUid` and redirects to `/lakad/[id]`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
