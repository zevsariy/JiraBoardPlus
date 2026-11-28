# Chrome Web Store — Jira Board Plus

Last updated: 2026-11-28. Release documentation: 0.40.0. This file is excluded from the extension ZIP. It records listing information, not a claim that this release has been submitted to the store.

## Store listing

**Name:** Jira Board Plus

**Short description:** Доски, JQL-отчёты, метрики Scrum/Kanban и роадмэп релизов для Jira Server / Data Center.

**Detailed description:** The maintained Russian listing is [store/01-store-listing-ru.txt](store/01-store-listing-ru.txt). It describes board context, reports, metrics, release planning, optional AI and local data. The 0.29.0 update adds grouped navigation and a searchable settings center with section saving, draft cancellation and larger checkbox labels. Existing settings and module entry points are preserved.

**Category:** Productivity (proposed listing category).

**Single purpose:** Help users review and plan their team's work in their configured Jira Server / Data Center installation.

**Primary language:** Russian.

## Graphics and assets

The manifest references the existing `icons/report.png`; branding and promotional assets are in `icons/` and `store/`. Screenshots featuring the old horizontal menu or old settings page need refreshing before a store submission. Current fixture-based verification screenshots are generated in `test-output/` and are not release assets. Verify screenshot dimensions and select representative screens before submitting to the store.

## Permissions justification

No permissions were added in 0.29.0 or 0.29.1.

| Permission | Purpose |
| --- | --- |
| storage | Keep connection settings, report definitions, preferences and locally saved work. |
| unlimitedStorage | Retain user-requested reports, plans, history snapshots and local notes that may exceed the ordinary storage quota. |
| alarms | Run enabled JQL report schedules while extension pages are closed. |
| notifications | Notify the user of changes found by their configured JQL reports. |
| scripting | Add Board Plus controls to the Jira installation authorized by the user and collect diagnostics when explicitly started. |
| Optional `https://*/*` | The installation address is supplied by the user. Access is requested for the selected Jira origin; an explicitly configured remote model may require its own origin grant. |
| Optional HTTP localhost, 127.0.0.1 and [::1] | Allow a user-configured local model or local testing endpoint without granting arbitrary insecure HTTP hosts. |

## Privacy and data use

Jira task content and report results are processed for the requested features and may be stored locally. Names and descriptions can contain personal or confidential information. Jira requests use the existing browser session. Board Plus does not store the Jira password.

Optional AI sends the selected previewed content to the model endpoint configured by the user only after explicit initiation. Its API key remains in local extension storage and is excluded from normal exports. Diagnostic reports are not automatically sent to the developer. The settings redesign adds local navigation preferences and in-memory form drafts; it adds no analytics or external service.

Data is not sold, used for unrelated purposes, or used for creditworthiness. The store disclosure must reflect the actual user content and authentication data handled by the extension; do not describe the product as handling no user data.

**Privacy policy:** [Repository policy](https://github.com/zevsariy/JiraBoardPlus/blob/main/PRIVACY.md).

## Distribution and developer

GitHub releases provide packaged ZIPs: [Releases](https://github.com/zevsariy/JiraBoardPlus/releases).

Developer identified in the project policy: Sergey Tkachenko (`zevsariy`). Support: [GitHub Issues](https://github.com/zevsariy/JiraBoardPlus/issues). Homepage: [Repository](https://github.com/zevsariy/JiraBoardPlus).

Store visibility, regions, verified publisher information and public contact email must be confirmed in the existing developer account before a store submission. They are not inferred from a GitHub release.

## Version history

| Version | Date | Change | Store status |
| --- | --- | --- | --- |
| 0.29.0 | 2026-11-27 | Unified navigation, settings center, search, section saving and improved forms. | Submission not performed by this task. |
| 0.28.0 | 2026-11-27 | Engineering diagnostics for network, server observations and browser responsiveness. | Not verified here. |

## Review notes

Jira Server / Data Center requires the user's installation and session. Development checks use synthetic fixtures; no corporate Jira is contacted. Server CPU/JVM/database metrics are unavailable without server monitoring. Store publishing is separate from the repository's automated GitHub release workflow.

Version 0.29.1 (2026-11-27): safer partial-profile import, one local pre-import profile backup excluding AI keys and result data, and network-budget storage-failure recovery. No store submission performed.

Version 0.30.0 (2026-11-28): selective settings restore with before/after preview, local pre-apply backup and conflict checks. No new permissions. Preview data stays in browser session storage; backup settings exclude AI keys and result data. No store submission performed.

Version 0.31.0 (2026-11-28): local browser-evidence diagnostics with confidence, supporting metrics, quality gaps and offline explanations for saved reports. No new permissions or automatic requests. No store submission performed.

## 0.37.0 — Personal board tools

Local board views, cached card context and visibility explanations use existing page/cache data with no additional Jira requests or permissions. Preferences are scoped to Jira base URL, account name exposed by Jira, and board ID; they are included in settings backup. Existing settings are retained. This is release documentation, not a claim of store submission.


## 0.38.0 — Local drafts and personal templates

Local recovery for plain-text comments, descriptions and summaries; independent editor copies, storage error recovery and reusable task/comment templates. Rich-text editors require text mode. No additional Jira HTTP calls or permissions; existing settings preserved. Draft/template text stays in the browser profile and is excluded from current archives and AI requests.


## 0.39.0 — Personal attention queue

Local pinned issues, personal notes, snoozed reminders and observed field changes. No background Jira polling. Explicit refresh verifies the signed-in user and reads selected fields for up to 50 issues through the existing shared request budget. Existing settings and permissions remain unchanged. Generic local notifications reveal no issue content.


## 0.40.0 — Personal workspace archive

Selective local export and restore for personal board views, drafts, templates and attention queues. Private text requires explicit inclusion. Conflict preview defaults to keeping existing data; atomic backup and guarded partial rollback protect newer work. Restored reminders are paused. No Jira requests or new permissions; existing settings archives remain compatible.
