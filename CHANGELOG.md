# Changelog

## 0.20.23 — 2026-10-18

- Add named local roadmap plans per Jira server/project (up to 50): create, restore, update/rename and delete.
- Preserve scope, version field/release, hierarchy and field mappings, development cutoff, Team filter and Gantt view preferences.
- Restore configuration without automatically querying issues; validate current metadata and explicitly rebuild for fresh results.
- Cover persistence across reload, renaming, separate copies, deletion and restored field configuration in browser tests.


## 0.20.22 — 2026-10-18

- Build dependency graph on demand instead of while the Gantt tab is active.
- Paginate problem, dependency and quality tables at 50 rows, retaining full-plan counts and exports.
- Index dependency lookups and conflict membership to avoid repeated issue scans.
- Verify a full mocked 2000-issue load with server-capped pagination and 1999 dependencies, plus the existing 5000-row Gantt fixture in both themes.
- Retain the 2000-issue loading and 250-node graph limits.


## 0.20.21 — 2026-10-18

- Restrict injected Jira scripts to RapidBoard and issue browse routes instead of the whole configured Jira site.
- Exit content entry points before initializing timers, observers or messaging on Plans and unrelated pages.
- Add no-initialization regression coverage for Plans, Structure and dashboards; retain board, Details, notes and Sprint report behavior.
- Reload existing Jira tabs after updating to remove previously injected scripts. This isolates unnecessary activity; a Plans refresh caused by the extension has not been reproduced.


## 0.20.20 — 2026-10-18

- Add native full-screen Gantt with search/navigation, full available width and height, and issue inspector inside the full-screen view.
- Redraw on full-screen changes while preserving scroll; exit via button or browser Escape.
- Verify full-screen entry/exit and issue inspection in browser tests.


## 0.20.19 — 2026-10-18

- Virtualize Gantt plans over 100 rows, rendering the visible window with overscan while retaining complete navigation indexes.
- Schedule scroll rendering with requestAnimationFrame and dispose old listeners on redraw/reset.
- Render dependency arrows near visible endpoints; preserve full dependency tables and exports.
- Fix graph-to-Gantt navigation to reach unrendered rows.
- Test 5000 synthetic rows, distant navigation, scrolling, dependency visibility and redraw position; Jira loading limit remains 2000.


## 0.20.18 — 2026-10-18

- Search loaded roadmap issues by key/title, expand ancestors and focus the matching Gantt row without Jira requests.
- Add persistent tree width, date navigation and a non-modal issue inspector with Escape/focus restoration.
- Preserve timeline scroll during redraw and index hierarchy inclusion/dependency endpoints to avoid repeated scans.
- Verify navigation, light/dark layouts and existing roadmap workflows with browser mocks.


## 0.20.17 — 2026-10-18

- Respect hidden component controls for non-component roadmap scopes.
- Fill wide timeline viewports, compact rows with room for warnings and wrap issue titles to two lines.
- Group view, display, hierarchy and export/AI controls; clarify inherited feature Due Date.


## 0.20.16 — 2026-10-18

- Add roadmap root scope: components, labels, favourite Jira filters, custom JQL or the whole project; preserve descendant traversal.
- Build explicitly after selecting scope/release and hide stale results when parameters change.
- Group hierarchy, dates/teams, columns and validation settings into disclosures; document scope rules.


## 0.20.15 — 2026-10-18

- Group metrics into current board, period results, completion time and Scrum trends with plain-language guidance.
- Collapse calculation settings and detailed tables; keep the current overview open initially.
- Switch between board overview and the selected sprint report without reloading either view.


## 0.20.14 — 2026-10-18

- Load Jira fields automatically in settings and offer Team candidates with searchable names and IDs.
- Accept unique exact names or manual IDs; reject ambiguous names and preserve the configured selection.

## 0.20.13 — 2026-10-18

- Organize team dashboard filters into period/selection and calculation parameter groups.
- Align board, mode and sprint selectors and responsive control grids in both themes.

## 0.20.12 — 2026-10-18

- Group sprint metrics into scope, plan completion, estimates, and cycle time/reopens sections with responsive tile grids.
- Hide the estimates section for count-only boards; preserve calculations and filters.

## 0.20.11 — 2026-10-18

- Align sprint assignee, issue type and percentile filters in a responsive grid with labels above inputs and actions below lists.
- Use evenly sized metric tiles and stack filters in narrow panels.
- Align export labels and controls without changing Jira-native styling or report behavior.

## 0.20.10 — 2026-10-18

- Clarify that the full JQL notification mode covers new issues, departed issues and changed column values.
- Explain comparison with the previous successful query run and scope to selected report columns, with accessible help text.

## 0.20.9 — 2026-10-18

- Show sprint cycle time and status age with two decimal places; tiny positive durations remain distinct from zero.
- Keep the percentile explanation consistent with the selected P50/P70/P80/P85.
- Add browser coverage for minute-scale cycle time and every percentile explanation.

## 0.20.8 — 2026-10-18

- Avoid displaying a hardcoded Timepiece version in status duration tooltips.
- Display small positive status durations as < 0.01 in the selected unit instead of rounding them to zero.
- Verified Timepiece 6.5.15.87 current-visit data on the live test board.

## 0.20.7 — 2026-10-18

- Calculate Jira status age on cards using the response Date header, avoiding temporary invalid-history errors when the Jira clock is ahead of the browser.
- Keep local-clock fallback when the server omits Date; history consistency checks remain enabled.
- Added a browser regression with future transitions relative to the client clock.

## 0.20.6 — 2026-10-18

- Added a configurable Shared Team field ID for the Details editor; read, edit metadata and save now use the selected field.
- Fixed backlog enhancements, private-note card discovery and AI board snapshots for compact Jira backlog cards.
- Recognized the planning.nodetail backlog route in Team, card enhancements and private notes.
- Added regression coverage for a non-default Team field and compact backlog cards.

## 0.20.5 — 2026-10-18

- Restored offline report, metrics and refinement browser tests after the shared theme preference was introduced.
- Updated extension smoke coverage for the popup theme selector and neutral project fixture.
- Added `npm run test:browser` to run all 16 browser scenarios and report every failure.
- These checks use synthetic Jira fixtures; they do not certify compatibility with a live Jira installation.

## 0.20.4 — 2026-10-11

- Added optional support links in the popup and settings, opening the donation page in a new tab.
- Published source, tests and development documentation on GitHub; added automated checks.
- Added reproducible release packaging and GitHub Releases automation. Manual RETEST notes remain local.

## 0.20.3

- Replaced internal example masks with neutral placeholders in roadmap settings and help.

## 0.20.2

- Removed role-specific naming from the interface, documentation and default AI prompt.

## 0.20.1

- Faster graph wheel zoom, zoom buttons and increased maximum zoom.
- Persistent light, dark and system theme selection from the popup, synchronized across extension tabs.

## 0.20.0

- Interactive dependency graph with hierarchy aggregation, focus, filters and locally saved positions.
- Selective dependency arrows on the Gantt chart.

## 0.19.0

- Compact AI roadmap payload with explicit coverage reporting.
- Sticky Gantt header, hierarchy colors, branch exclusion masks and configurable issue tables.

## 0.18.0

- Configurable fields from parent Epic and Component on board and backlog cards.

## 0.17.0

- Local development cutoff per release, UTC date exports and clearer roadmap presentation.

## Earlier versions

- Shared Team editing, optional board enhancements, private notes, scheduled JQL reports, Scrum/Kanban metrics, refinement tools, roadmap and optional AI analysis.
