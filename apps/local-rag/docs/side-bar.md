# Sidebar integration plan

Goal: mount the shared `Sidebar` UI on the left and add three nav links (order: Chat, Documents, Models) that use Lucide icons:
- "Chat" (MessageSquareQuote) → placeholder page
- "Documents" (BookText) → placeholder page
- "Models" (Bot) → existing `ModelDownload`

## Assumptions
- We keep the sidebar persistent on desktop and toggleable on mobile (uses the built-in `SidebarProvider` behaviors).
- Navigation should use TanStack Router links so active state is available.
- `ModelDownload` will live at `/models`; `/` should stay as a Welcome page (simple hero/CTA).

## Steps
1) **Wrap the app with the sidebar shell**
   - In `src/routes/__root.tsx`, wrap the body content with `SidebarProvider` and place a flex container that holds the sidebar + routed pages.
   - Add a lightweight top bar with `SidebarTrigger` for mobile and small screens.

2) **Add a sidebar nav component**
- Create `src/components/SidebarNav.tsx` (or similar) that composes `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, and `SidebarRail`.
- Define a nav items array in this order:
  - `{ label: "Chat", icon: MessageSquareQuote, to: "/chat" }`
  - `{ label: "Documents", icon: BookText, to: "/documents" }`
  - `{ label: "Models", icon: Bot, to: "/models" }`
- Use TanStack Router’s `Link` for the menu buttons so active styling works; add tooltips on collapsed view.
- Keep the sidebar pinned to the left via `side="left"` and `variant="sidebar"`; rely on default width tokens.

3) **Lay out routed content beside the sidebar**
   - Inside the shell, render `SidebarInset` wrapping the current `<Outlet />` so pages sit to the right of the sidebar with correct spacing.
   - Use a shared inset container for all routes: `className="min-h-screen bg-background px-4 py-10 md:px-8"` (adjust later if desired).
   - Preserve the background on the `main` / inset wrapper, not inside individual pages, so layout stays consistent.

4) **Add routes for nav items**
- `src/routes/models.tsx`: render `<ModelDownload />` in the main column.
- `src/routes/chat.tsx`: placeholder page (e.g., “Chat coming soon”) with consistent padding/container.
- `src/routes/documents.tsx`: placeholder page (e.g., “Documents coming soon”).
- Update `src/routes/index.tsx` to stay as a Welcome page with a CTA link to `/models` and maybe a short blurb.
  - Default welcome layout: center column using the same inset spacing above, e.g., a `div` with `className="mx-auto max-w-5xl space-y-6"` containing a heading, short description, and a link button to `/models`.

5) **Polish & guardrails**
- Verify mobile behavior: `SidebarTrigger` toggles the sheet version and `SidebarRail` still works on desktop.
- Ensure Lucide icons are imported: `Bot`, `MessageSquareQuote`, `BookText`.
- Optional: add a small sanity test that the sidebar renders all three links with correct hrefs.
- A11y checklist:
  - `aria-current="page"` on the active nav link.
  - Focus stays visible when toggling the mobile sheet; initial focus moves into the sheet content; return focus to the trigger on close.
  - Tooltip content hidden on mobile and when sidebar is expanded (already in component, verify).
  - Keyboard shortcut (⌘/Ctrl + b) keeps working with new layout.
- Active-state styling: compute `isActive` from TanStack Router (e.g., `Link` render prop or `useMatch`/`useRouterState`) and pass to `SidebarMenuButton`; use the primary button palette when active (`bg-main`, `text-main-foreground`, `outline-border`).
- Layout note: place the top bar (with `SidebarTrigger` for mobile) inside the root shell, above `SidebarInset` and `<Outlet />`, so it remains aligned with the main content.

## Decided items
- `/` remains a Welcome page (no redirect).
- Nav slots (order): Chat, Documents, Models (with icons).
- Sidebar preference persistence: current cookie in `Sidebar` is sufficient; no extra work planned now.
