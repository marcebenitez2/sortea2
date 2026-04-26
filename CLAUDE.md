# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (Turbopack, port 3000)
npm run build    # Production build (Turbopack by default)
npm run start    # Start production server
npm run lint     # Run ESLint (flat config, not `next lint`)
```

There is no test suite configured yet.

## Architecture

Fresh Next.js 16 app using the **App Router** (`app/` directory). No pages router.

- `app/layout.tsx` — root layout; sets fonts (Geist via `next/font/google`) and global CSS
- `app/page.tsx` — home route (`/`)
- `app/globals.css` — global styles; uses Tailwind v4 via `@import "tailwindcss"` and `@theme inline`
- `public/` — static assets served at root

Path alias `@/*` maps to the project root.

## Next.js 16 — Key Breaking Changes

**Always read `node_modules/next/dist/docs/` before writing code.**

### Async-only Request APIs
`cookies()`, `headers()`, `draftMode()`, `params`, and `searchParams` **must** be awaited — synchronous access is removed entirely.

```tsx
// page.tsx
export default async function Page({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params   // must await
}
```

Run `npx next typegen` to generate `PageProps`, `LayoutProps`, and `RouteContext` helpers.

### `middleware` → `proxy`
The `middleware.ts` convention is deprecated. Use `proxy.ts` with a named export `proxy`. The `edge` runtime is **not** supported in `proxy` — keep `middleware.ts` if you need edge.

### Turbopack by default
Both `next dev` and `next build` use Turbopack. Custom `webpack` configs will break the build. Use `--webpack` flag to opt out, or migrate to Turbopack options.

### Caching (`use cache` directive)
The old `fetch` cache semantics are replaced. Enable with `cacheComponents: true` in `next.config.ts`, then use the `'use cache'` directive on async functions/components. See `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`.

### ESLint
Uses flat config (`eslint.config.mjs`). The `next lint` CLI command is removed — run `eslint` directly (`npm run lint`).

### Removed
- AMP support (`next/amp`, `config.amp`)
- Runtime configuration (`publicRuntimeConfig`, `serverRuntimeConfig`)
- `next/legacy/image`
- `images.domains` (use `remotePatterns`)
