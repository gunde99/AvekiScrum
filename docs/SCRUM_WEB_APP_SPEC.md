# Spec: AvekiScrum — Scrum Web Platform (Azure DevOps UI Replacement)

Status: **Draft — not implemented.** This document specifies what needs to be built. No code has been written against this spec yet. It supersedes `WorkOrganizer/docs/COLLEAGUE_MINI_TOOL_SPEC.md` (kept there for its still-relevant PAT-security analysis, but its "shared service account + broker inside WorkOrganizer" model is no longer the target — see §6/§7).

## 1. Vision

Replace Microsoft's Azure DevOps web UI, for Scrum ceremonies first, with a purpose-built web app the whole company can use — everyone signs in as themselves via **Aveki ID** (the company's own identity broker), sees a consistent, on-brand interface, and the tool keeps working even when its original author isn't around.

This is a deliberate ground-up rebuild, not an extraction. The five existing WinForms-hosted HTML dashboards in the `WorkOrganizer` repo were built as one person's specialized tooling, inside a repo (`WorkOrganizer`) that is explicitly **personal and will not be shared within the organization**. The new product — codename **AvekiScrum** (naming discussion in §2) — is a **separate, standalone codebase**: its own repo/solution, its own namespaces, deployable and shareable independently of `WorkOrganizer`. Business logic worth keeping is *copied* over and adapted, not referenced live from `WorkOrganizer` — see §5 for exactly what and how.

Product goals: modular (a component like the Work Item form is built once and reused across boards), consistent in layout and visual design, and following the company graphic profile.

Scope for v1 is the four Scrum ceremony boards: **Planering** (Planning), **Dailys** (Daily standup), **Review/Demo**, **Retro**. Planering and Dailys are the most complete in the current `WorkOrganizer` project and are the intended starting point — "lifted over" in the sense of porting their proven data/functionality, not their current code structure or UI. The long-term ambition is broader (replacing more of the Azure DevOps web UI over time), so the architecture should not paint the project into a Scrum-only corner, but v1 delivery is scoped to these four boards.

## 2. Naming

Three candidates were on the table: **AvekiScrum**, **AvekiAzure**, **AvekiDevOps**.

Recommendation: **AvekiScrum** (matches the folder already created).

- It says exactly what v1 is to the people who'll use it — colleagues care that it's "our Scrum tool," not that it's an Azure DevOps client.
- `AvekiDevOps` reads as broader/more future-proof, but risks two kinds of confusion: colleagues assuming it's a CI/CD or general DevOps platform (it isn't), and an awkward near-duplication of Microsoft's actual product name it's replacing.
- `AvekiAzure` is the vaguest of the three — closer to "our Azure cloud infrastructure" than a Scrum tool.
- If the product later grows well beyond Scrum ceremonies into a full Azure DevOps UI replacement, renaming a product once it has traction is a normal, cheap event; shipping a name that oversells current scope is the costlier mistake. Worth revisiting if/when Phase 4+ work (see §9) actually broadens scope.

## 3. Current-State Inventory (grounds this spec in what exists in `WorkOrganizer` today)

| Board | Current files (in `WorkOrganizer`) | Size | Backend logic | Reuse verdict |
| --- | --- | --- | --- | --- |
| Planering | `Scrum\PlaneringsBoard\sprintplanering.html` + `PlaneringsBoardAzureClient.cs` + `PlaneringsBoardManager.cs` + `PlanningInvestReviewer.cs` + `PlaneringsBoardInitialization.cs` | HTML ~6,000 lines; client ~2,600 lines | `PlaneringsBoardAzureClient` depends only on `IOptions<AzureSettings>`, `IConfiguration`, `ITeamRoleProvider` — no WinForms/DevExpress usings. Most complete feature set: backlog, board, capacity/absence grid, sprint goals, work-item detail/edit, DoR/INVEST checklist. | **Copy the backend logic into AvekiScrum wholesale**, renamespaced; rewrite the UI. |
| Dailys | `Scrum\DailyDashboard\daily-sprint-dashboard.html` + `DailyDashboardDataBuilder.cs` + `DailyDashboardFlowAnalyzer.cs` + `DailyDashboardManager.cs` + `ReleaseBranchValidator.cs` | HTML ~2,080 lines | `DailyDashboardDataBuilder` depends only on `IAzureDevOpsService` — zero UI coupling, cleanest of the three. | **Copy the backend logic wholesale**, renamespaced; rewrite the UI. |
| Review/Demo | `Scrum\ReviewRetroBoard\sprint-review-dashboard.html` + `ReviewRetroBoardManager.cs` | HTML ~3,190 lines (shared with Retro, see below) | `ReviewRetroBoardManager` depends on `IAzureDevOpsService`, `IPersonImageProvider`, `IRetroBoardCardRepository`, `IWikiService`, config — again only Application-layer abstractions, plus `BrowserDashboardHost`/local-HTTP-server plumbing that has no equivalent need in a real web app. | Copy the review-metrics half of the logic; needs to become its **own** board (see §4). |
| Retro | Same file as Review/Demo, interleaved | (included above) | Same manager class; backed by `IRetroBoardCardRepository` → EF entities `RetroMeetingNote`/`RetroMeetingProtocol`, plus `RetroMeetingConfig`. | Copy the retro-notes/check-in/protocol logic as its own board (see §4). |

**Dead code found during this inventory**: `WorkOrganizer.Presentation.Templates\Templates\Pages\RetroDashboard.cshtml` (Razor) and its `PresentRetroDashboardAsync` renderer have no live caller anywhere except a render test — only the currently-used `ReviewRetroBoardManager`/`sprint-review-dashboard.html` path is real. Do not port the Razor version; it's a static metrics summary, not the retro workflow.

**Consistency problems already visible** (motivating §8): `sprintplanering.html` does not reference the shared `Scrum\Dashboards\Shared\Resources\dashboard-branding.css` that the other four dashboards use — it has its own, fully separate inline styling. There are at least **three independent reimplementations** of a person-avatar/name renderer (planning board's `avatarHTML`, daily dashboard's `personInline`/`compactPersonName`, and the review/retro board's own check-in avatar rendering) and **three independent reimplementations** of a round-robin check-in state machine (daily dashboard's inline daily-flow code, the review/retro board's check-in code, and the standalone `Resources\Shared\DailyCheckInCore.js` extraction that was built for exactly this purpose but was never actually wired into any dashboard). This is precisely the kind of duplication a shared component library is meant to kill — and precisely the kind of thing that's worth fixing *while copying*, not preserving faithfully.

## 4. Board Scope For V1

Split Review/Demo and Retro into two distinct boards/routes (they are one intertwined file today):

- **Planering** — backlog, sprint board, capacity/absence, sprint goals, work-item create/edit, DoR/INVEST checklist.
- **Dailys** — per-team standup view, goals, developer status, wellbeing check-in, KPI/kanban view.
- **Review/Demo** — sprint review slide deck: velocity/burn-up, PR/test quality metrics, sprint-goal outcomes.
- **Retro** — attendee check-in, retro notes by column, meeting-notes drawer, markdown protocol editor with wiki publishing.

Out of scope for v1 (explicitly, so they don't creep in): the Developer workflow (`DeveloperView`/projects/activities/task cards — this stays in `WorkOrganizer` and is not part of AvekiScrum), Test Week dashboard, and any Azure DevOps surface beyond these four ceremonies (Repos/PRs browsing, full Wiki editing, Test Plans UI, etc.). The architecture in §7 should not block adding these later.

## 5. Codebase Separation: What Gets Copied, and How

`AvekiScrum` is a new, standalone codebase — not a project added to `WorkOrganizer.sln`, not referencing `WorkOrganizer.*` assemblies. `WorkOrganizer` stays exactly what it is today: your personal app, never distributed org-wide. The two codebases will look similar at the Azure DevOps integration layer for a while, and are expected to diverge after that — that's the accepted tradeoff of a straight copy (a bugfix made in one won't automatically appear in the other; worth a periodic manual diff of the Azure DevOps client code specifically, since that's the part most likely to need the same fixes in both places over time).

What to copy from `WorkOrganizer`, source → target:

| Source (`WorkOrganizer.*`) | Target (`AvekiScrum.*`) | Notes |
| --- | --- | --- |
| `WorkOrganizer.Domain` (Scrum-relevant entities only: `RetroMeetingNote`, `RetroMeetingProtocol`, team/role types, etc.) | `AvekiScrum.Domain` | Leave out Developer-workflow entities (`Project`, `Activity`, `TaskCard`, `Stakeholder`, `FileReference`) — not in scope. |
| `WorkOrganizer.Application` (Scrum abstractions/config: `AzureSettings`, `ITeamRoleProvider`, `IPersonImageProvider`, `IRetroBoardCardRepository`, `RetroMeetingConfig`, `TeamRoleConfig`) | `AvekiScrum.Application` | Same trim: no Developer-workflow use cases. |
| `WorkOrganizer.Infrastructure` (`AzureDevOpsService` + the `Refaktorisering` client split, `PersonImageProvider`, EF repositories backing the entities above) | `AvekiScrum.Infrastructure` | The Azure DevOps REST/SDK plumbing is the highest-value copy — it's already UI-agnostic. |
| `PlaneringsBoardAzureClient.cs`, `DailyDashboardDataBuilder.cs`, `ReviewRetroBoardManager.cs`'s data-assembly logic (currently under `WorkOrganizer.UI.WinForms\Scrum\...`) | `AvekiScrum.Application` (or `.Infrastructure` for the raw REST parts) | These were only ever placed under the UI project for convenience — see the dependency analysis in the original inventory (constructors take only `IOptions<AzureSettings>`/`IConfiguration`/`IAzureDevOpsService`/etc., no `System.Windows.Forms` or DevExpress usings). Copy, don't reinvent. |

What does **not** get copied: `WorkOrganizer.UI.WinForms` (all of it — ribbon, DevExpress, `BrowserDashboardHost`, `LocalDashboardHttpServer`, the Developer workflow), the EF Core `DbContext`'s non-Scrum `DbSet`s, and `appsettings.json`'s branding/team-role data as-is (rebuild a trimmed config for AvekiScrum — see the privacy note already captured in `COLLEAGUE_MINI_TOOL_SPEC.md` §9, still applicable).

Mechanics of the copy: bring the files over, then a straightforward find/replace of the `WorkOrganizer.` namespace prefix to `AvekiScrum.` (project-wide rename, plus updating `.csproj` `RootNamespace`/`AssemblyName`). No behavior change expected in this step — it's a lift, not a rewrite; the rewrite is the new UI (§6) and the new host (§7).

**Repo hosting**: `AvekiScrum/` currently lives as a subfolder inside the `WorkOrganizer` git repository's working tree (that's just where it was created). Since the entire point of this split is that `WorkOrganizer` stays private and unshared, **AvekiScrum should become its own independent git repository** (its own remote, its own history) before any real code lands in it — otherwise every AvekiScrum commit would live inside the `WorkOrganizer` repo's history, defeating the separation. Until that's set up, add `AvekiScrum/` to `WorkOrganizer`'s `.gitignore` so nothing in it is accidentally swept into a `WorkOrganizer` commit.

## 6. Authentication & Authorization — via Aveki ID

Per the confirmed direction, sign-in goes through **Aveki ID** (Aveki's own identity broker, documented in `AvekiScrum\docs\Aveki ID [PRODUKT].pdf` and `Aveki ID [TEKNISK].pdf`), not directly against Microsoft Entra ID/MSAL. This supersedes §6 of `COLLEAGUE_MINI_TOOL_SPEC.md` (which assumed direct Entra ID integration) and its broker/shared-PAT model.

**What Aveki ID actually is**, from the technical documentation: a centralized authentication/authorization service (built on FoxIDs, supporting OpenID Connect and SAML 2.0) that federates to whichever identity provider is configured — Entra ID, Nexus, or a customer's own IdP — so Aveki's applications (web/app/desktop clients) never talk to the underlying IdP directly. The standard flow (per the "Inloggningsflöde för app" diagram) is:

1. The client asks Aveki ID for its **authority URL** (standard OIDC discovery).
2. The client initiates authentication against that authority; Aveki ID federates to the configured IdP (Entra ID, in Aveki's own case) and authenticates the user.
3. Aveki ID returns an ID token, access token, and refresh token (authorization-code-style flow with a `Code` exchange step).
4. The client calls the API (through a gateway, per the diagram) using the access token; the API/gateway verifies the token against Aveki ID's published validation keys (JWKS, refreshed near expiry).
5. Aveki ID Plus additionally correlates the authenticated identity against the customer's Active Directory by the token's **email claim**, and supports app-specific authorization checks — the reference flow shows "verify registered user in [app] register (database)" and "verify member of AD-group (optional)" as configurable steps alongside AD-user verification.

Applied to AvekiScrum:

- **Frontend**: standard OIDC client (authorization code + PKCE) pointed at Aveki ID's authority URL for the AvekiScrum client registration — not `@azure/msal-react`/direct Entra ID. Whatever OIDC client library fits the chosen frontend stack (React) works here since Aveki ID speaks standard OpenID Connect.
- **Backend**: the AvekiScrum API validates the access token issued by Aveki ID (JWKS-based bearer validation), the same pattern shown for the API/gateway in the technical doc — not a raw Entra-issued token.
- **App-level authorization**: mirror the documented pattern — an "AvekiScrum register" of who's allowed in (could be as simple as "member of an AD/Entra group for the relevant teams"), rather than reinventing a permissions model. This plays the same role §11's old "app-level authorization" question did, but the mechanism is now Aveki ID's existing pattern instead of something bespoke.

**Open technical question — calling Azure DevOps itself** (this is the one piece the Aveki ID documentation doesn't directly answer, and needs a real spike before the design is locked): Aveki ID's access token is scoped to the *AvekiScrum* client registration/API, proving who the user is and that they're an authorized AvekiScrum user — it is not automatically an Entra-ID-audience token usable for an On-Behalf-Of exchange against Azure DevOps' resource ID (`499b84ac-1321-427f-aa17-267ca6975798`). Two realistic paths, to be resolved with whoever administers Aveki ID/FoxIDs:

1. **Aveki ID Plus performs (or can be configured to perform) a downstream token exchange/federation to Azure DevOps' Entra tenant on the app's behalf**, so the AvekiScrum backend receives or can request a token usable against Azure DevOps directly. This would be the cleanest outcome if FoxIDs/Aveki ID supports it.
2. **AvekiScrum registers its own, separate, direct Azure app registration in the company's Entra tenant**, used purely for the Azure-DevOps-facing OBO leg, independent of the Aveki-ID-issued session token used for "who is logged in." The two identities are correlated by email claim — exactly the same correlation pattern Aveki ID Plus itself already uses for AD correlation, just applied one layer further down (Aveki-ID-authenticated user's email → matched to the same person's Entra identity for the Azure DevOps call).

Either is workable; which one is realistic depends on Aveki ID Plus's actual capabilities, which is worth a short, focused conversation/spike before committing UI or backend work to one shape.

**Fallback**: if neither delegated path is ready in time for v1, fall back to a single scoped **service-account PAT** held server-side only (§6 of `COLLEAGUE_MINI_TOOL_SPEC.md` still describes the PAT-scoping and secret-storage guidance correctly), with the Aveki-ID-authenticated user identity used for app-level authorization and audit logging rather than for the outbound Azure DevOps call. This is an acceptable v1 shortcut, not a security compromise, as already agreed — just not the end state.

**Audit**: whichever delegated path is chosen, Azure DevOps' own audit trail then shows the real user for every write, which is the whole point of moving away from a shared broker credential.

## 7. Target Architecture & Repo Layout

Standalone solution, not added to `WorkOrganizer.sln`:

```text
AvekiScrum/                         (own repo — see §5's hosting note)
├── docs/                           SCRUM_WEB_APP_SPEC.md (this file), Grafisk profil.pdf, Aveki ID docs
├── AvekiScrum.sln
├── AvekiScrum.Domain/              copied+renamespaced from WorkOrganizer.Domain (Scrum-only entities)
├── AvekiScrum.Application/         copied+renamespaced from WorkOrganizer.Application (Scrum-only) +
│                                   relocated board data-assembly logic (§5)
├── AvekiScrum.Infrastructure/      copied+renamespaced from WorkOrganizer.Infrastructure
│                                   (Azure DevOps clients, EF repositories, person image provider)
├── AvekiScrum.Api/                 ASP.NET Core Web API — Aveki ID JWT bearer auth (§6),
│                                   REST endpoints per board, hosts Kestrel directly (no HttpListener)
├── AvekiScrum.Client/              React + TypeScript SPA (Vite), OIDC client for Aveki ID
│   └── src/
│       ├── components/             BoardShell, WorkItemCard, WorkItemDetailForm, PersonAvatar,
│       │                           TeamProjectSelector, CapacityGrid, CheckInFlow, CommentThread,
│       │                           SprintGoalEditor, RetroBoard, ProtocolEditor
│       ├── theme/                  design tokens from §8 (colors, type scale, spacing)
│       ├── boards/
│       │   ├── planering/
│       │   ├── dailys/
│       │   ├── review/
│       │   └── retro/
│       └── api/                    typed client for AvekiScrum.Api
└── AvekiScrum.Application.Tests/   xUnit, mirrors WorkOrganizer.Application.Tests conventions
```

This gives AvekiScrum one source of truth for its own domain/business logic, fully independent of `WorkOrganizer`, deployable to the company web server hosting Aveki's other app backends.

## 8. Design System (from `AvekiScrum\docs\Grafisk profil.pdf`)

Company graphic profile ("Aveki 2026") gives concrete tokens to build the shared theme from, avoiding a repeat of the "layouten spretar" problem the current dashboards have:

**Color palette** (primary order: orange, yellow, green, grey, blue):

| Name | Hex | Role |
| --- | --- | --- |
| Orange (primary) | `#EA5B1B` | Primary brand color, majority of UI accents |
| Gul (yellow) | `#FECD1A` | Secondary |
| Grön Frässk (green) | `#9DBF21` | Accent |
| Grå Lugn (grey) | `#737373` | Neutral/text-support; profile also lists a full tint scale from `#E7E7E7` down to `#828282` — good source for a neutral scale (backgrounds, borders, disabled states) |
| Blå Cool (blue) | `#0F4170` | Accent; profile lists a tint scale (`#849BB1` → `#2A5781`) |

Each primary color has documented tint variants in the PDF (e.g. orange: `#F29D67`, `#F2834C`, `#ED783E`, `#F2692C`) — use these for hover/active states and chart series rather than inventing new shades. This maps well onto the existing dashboards' need for state colors (kanban lanes, capacity bars, DoD-risk indicators).

**Typography**:
- **TT Norms Pro** — the main font, for headings and body text, available in light/normal/medium weights. Licensed commercial font (not a Google Font) — sourcing/licensing web-font files for it is a task to track (see §9).
- **Lemon Tuesday** — the complementary font, explicitly *not* meant to replace TT Norms Pro in running text; the profile calls it out for warmth/playfulness in campaigns, events, and internal contexts. Use sparingly (a board's title treatment, an empty-state message) — never as the default UI font for forms, tables, or buttons.

**Logo & symbol**:
- Primary logo is the orange wordmark; black and white variants exist for exception cases. Never recolor, rotate, distort, frame, or add shadows/extra text near it. Minimum clear space and minimum size rules apply.
- The **symbol** (a standalone drop/pin mark derived from the logo, explicitly intended for small formats, in-app use, and backgrounds/Teams-style contexts) is the right asset for a favicon/app icon, not the full wordmark.

**Plan**: define one shared token set (CSS custom properties or a TS theme object, consumed by every board and by the shared component library from §4) once, in Phase 0 (§10).

## 9. Open Decisions (must be settled before implementation starts)

1. **Aveki ID → Azure DevOps token path** (§6) — confirm with whoever administers Aveki ID/FoxIDs whether a downstream token exchange to Azure DevOps is supported, or whether AvekiScrum needs its own direct Entra app registration for the OBO leg. Highest-priority open question; it shapes the whole auth implementation.
2. **AvekiScrum as its own git repository** (§5) — set this up before real code lands, so it's never entangled with `WorkOrganizer`'s history.
3. **TT Norms Pro / Lemon Tuesday licensing** — do we have (or need to buy) web-font licenses, and where do the font files live?
4. **Hosting specifics** — which existing company web server/app-hosting setup does `AvekiScrum.Api`/`AvekiScrum.Client` deploy to, and what's the deployment mechanism (CI/CD, manual publish)?
5. **MediatR or direct services** (§5) — introduce MediatR handlers for the copied board logic in `AvekiScrum.Application` (consistent with how `WorkOrganizer.Application` is structured) or keep the direct-service style the copied classes already use?
6. **App-level authorization data source** — Entra/AD group membership, a small AvekiScrum-specific user/team table (mirroring the "registered user in [app] register" pattern from the Aveki ID docs), or both?
7. **Order of Review vs. Retro** in Phase 2/3 (§10) — confirm which the team needs sooner, since they must be un-interleaved from one file into two boards either way.

## 10. Phased Delivery Plan

- **Phase 0 — Foundations**: set up the AvekiScrum repo/solution (§5, §7), copy+renamespace the Domain/Application/Infrastructure subset, register AvekiScrum as an Aveki ID client, resolve the Azure-DevOps-token open question (§9.1), build shared design tokens (§8) and `BoardShell`/`PersonAvatar`/`WorkItemCard` components, wire up CI. No board functionality yet — this phase exists so boards 1–4 are built on shared pieces and a working auth path from the start.
- **Phase 1 — Planering + Dailys**: port the two most-complete boards, backed by the copied `PlaneringsBoardAzureClient`/`DailyDashboardDataBuilder` logic (§5). This is the concrete "lift over what's already good" step requested.
- **Phase 2 — Review/Demo**: split out of the current combined file; port the velocity/quality/burn-up metrics logic.
- **Phase 3 — Retro**: split out of the current combined file; port check-in, retro notes, and protocol/wiki-publish logic from `ReviewRetroBoardManager` (not the dead Razor path — see §3).
- **Phase 4 — Beyond v1**: once the four boards have real usage, revisit whether AvekiScrum should grow into a broader Azure DevOps UI replacement (backlog browsing, PR review, wiki) — and whether the product name still fits (§2).
