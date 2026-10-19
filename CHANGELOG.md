# Changelog

## 0.24.25 — 2026-10-19

- Сравнение спринтов: одинаковые предупреждения показываются один раз; убран повтор заголовка, кнопки загрузки выровнены со списком.

## 0.24.24

- Уточнена подсказка роадмэпа: поле Team задаётся в общих настройках расширения, отдельно выбирать его не нужно.

## 0.24.23 — 2026-10-19

- Allow standalone Settings to load the Jira field catalogue without granting report-write operations.
- Use the shared Team field setting for roadmap loads and saved plans; remove the duplicate roadmap picker and clarify the common setting. Historical snapshots keep their original field metadata.

## 0.24.22 — 2026-10-19

- Use neutral styling for successful Tools messages instead of the error background; dismiss previous messages when switching tool sections.

## 0.24.21 — 2026-10-19

- Build the roadmap from the currently displayed hierarchy and field settings, validating them before querying Jira. Saving defaults remains a separate action.

## 0.24.20 — 2026-10-19

- Make roadmap backup and import available in a clearly labelled section before loading a release. Disable controls until the project context is ready.

## 0.24.19 — 2026-10-19

- Put basic metrics and roadmap instructions before advanced details in the built-in help; make chart and board-overview headings subordinate to the metrics section.

## 0.24.18 — 2026-10-19

- Explain that Sprint Report exports are handed to the browser; do not report a saved file before Chrome permits and finishes the download.

## 0.24.17 — 2026-10-19

- Schedule a dedicated alarm for the next JQL query deadline, preventing the periodic watchdog from adding an extra minute to short intervals.
- Restore the deadline alarm on startup and cancel it when schedules are disabled. Keep checkpoint recovery and error backoff.
- Verify scheduled deadlines with unit tests and the real browser Alarms API using synthetic Jira data.

## 0.24.16 — 2026-10-19

- Analyze Kanban backlog using its mapped statuses and board subquery instead of the Scrum-only backlog endpoint.
- Explain unconfigured Kanban backlog and select the working-column mode when backlog has no statuses. Never substitute working-column tasks for backlog tasks.
- Add regression coverage for separate backlog scope and missing status mappings.

## 0.24.15 — 2026-10-19

- Restore settings search inside Jira by mounting it with the shared settings module.
- Keep standalone and embedded filtering consistent; selecting a settings section clears the search and restores hidden cards.
- Cover filtering and navigation reset in the embedded browser regression.

## 0.24.14 — 2026-10-19

- Clear the dependency graph search selection when returning to the whole graph.
- Keep the search field synchronized when opening a selected card’s neighborhood.
- Cover cleared search state in the roadmap browser regression.

## 0.24.13 — 2026-10-19

- Explain empty refinement results: distinguish no source tasks, disabled rules for matching issue types, and no detected problems.
- Verify the no-problems message in the tools browser regression.

## 0.24.12 — 2026-10-19

- Put help section headings and introductory instructions before advanced notes so table-of-contents links land at a clear starting point.
- Remove the server-specific Team field ID from the introductory help text.

## 0.24.11 — 2026-10-19

- Show zero hours when Timepiece reports an explicit zero current state outside working-calendar hours, instead of an unknown-duration warning.
- Keep missing or ambiguous durations unknown; add regression coverage for zero-state matching and incomplete responses.

## 0.24.10 — 2026-10-19

- Hide Gantt-only controls and its legend in dependency graph mode; retain export and AI actions.
- Restore the controls on returning to Gantt without changing their values.
- Verify view switching in the roadmap browser test.

## 0.24.9 — 2026-10-19

- Keep Gantt sprint bands readable when the operating system uses dark mode but embedded Jira uses a light theme.
- Use the active UI surface token instead of a hard-coded dark sprint background.

## 0.24.8 — 2026-10-18

- Show Jira validation details for invalid roadmap JQL instead of suggesting a login problem for every HTTP error.
- Distinguish authentication, permissions, missing API and rate-limit failures; cap server error details.
- Verify root-only JQL scope on real Jira and add regression coverage for query errors and non-JSON failures.

## 0.24.7 — 2026-10-18

- Correct the AI modal disclosure: roadmap analysis sends a compact snapshot without issue summaries or extra fields.
- Add browser coverage for the roadmap-specific disclosure; retain explicit-send and Markdown rendering checks.

## 0.24.6 — 2026-10-18

- Correct embedded help: select Team from Jira field metadata instead of assuming a fixed ID.
- Align roadmap AI help with the compact snapshot and explicit omitted-row preview.
- Verify real Jira Team clear/save via Enter and persistence, parent fields in Kanban/backlog, Timepiece day units, and independent backlog analysis toggle.

## 0.24.5 — 2026-10-18

- Stop embedded workspace keyboard events from reaching Jira shortcuts; keep workspace keyboard handlers scoped to its shadow root.
- Make selected tabs and pressed view buttons visible in the Jira theme.
- Describe backup export as handed to the browser rather than claiming the file was saved.
- Verify real roadmap snapshots, zero-change comparison, local date scenario, conflict recalculation, scenario persistence and reset to original plan. Export and capacity need follow-up verification on the updated extension.


## 0.24.4 — 2026-10-18

- Use the explicitly configured Team field in new JQL reports instead of assuming customfield_10200; preserve saved query columns.
- Remove the incorrect hardcoded Team field name alias.
- Verify real Jira JQL creation, metadata loading, column order, unchanged rerun and exact Summary change detection. Restore the test issue after verification.


## 0.24.3 — 2026-10-18

- Consolidate embedded workspace migration into one update for joint real-Jira verification.
- Preserve short nonzero metric durations in cards and charts instead of rounding them to zero.
- Update percentile explanations when P50/P70/P80/P85 changes.
- Include embedded workspace regression in the standard browser suite.


## 0.24.2 — 2026-10-18

- Fix Team field discovery in embedded Settings through the existing sender-validated fields bridge.
- Keep the protected connection form disabled after asynchronous loading in embedded mode.
- Use the common configured Team field for refinement requests and missing-Team checks.
- Verify real Jira refinement selection (Scrum backlog/future sprint, Kanban column), profile export, notes create/edit and cross-view loading, Team search in Kanban Details, and Timepiece status popup. Full real-server regression remains in progress.
- Add regressions for installation-specific Team IDs and embedded field loading.

## 0.24.1 — 2026-10-18

- Keep embedded section navigation visible and route Help/Settings anchor links within Jira.
- Align metric selectors and compact roadmap tree controls in the Jira theme; preserve dependency legend colors.
- Hide Gantt controls in graph mode while keeping issue details accessible.
- Fall back to a full-window Gantt when browser fullscreen is unavailable; Escape restores the view.
- Discover the default Team field by name instead of assuming an installation-specific ID. Saved mappings remain unchanged.
- Add regressions for anchor navigation, denied fullscreen and Team field detection.

## 0.24.0 — 2026-10-18

- Embed Roadmap, Tools and general Settings in the Jira workspace, sharing existing controllers and data with standalone pages.
- Isolate roadmap persistence to the configured Jira/project; keep graph positions, snapshots and scenarios in their existing namespaces.
- Dispose requests, graph instances and document/window/storage listeners when switching sections.
- Keep server permission grants and AI key entry in the protected extension settings tab, with explicit buttons in embedded Settings.
- Verify all section transitions and preference saving in embedded browser tests, plus standalone Roadmap, Tools and Team settings regressions.


## 0.23.0 — 2026-10-18

- Add shared embedded navigation between Metrics, JQL reports and Help under the Jira header.
- Reuse report CRUD, schedules, results, field selection and notification actions through a sender-validated, operation-allowlisted bridge.
- Notify embedded reports of background updates without polling Jira; remove listeners and close dialogs on leaving the section.
- Scope controllers to their own content and ignore obsolete section loads. Keep Roadmap, Tools and Settings as explicit standalone links for the next migration stages.
- Verify embedded JQL creation and section transitions, plus standalone report regression.


## 0.22.1 — 2026-10-18

- Apply the Jira/AUI theme consistently to the embedded metrics shell and nested reports, including entry from Dashboard pages.
- Remove the fixed white workspace background; follow Jira surface tokens with a light Server fallback regardless of the OS theme.
- Add browser regression checks for shell, settings and nested theme under a dark OS preference.


## 0.22.0 — 2026-10-18

- Add a Board Plus entry in the configured Jira header, opening Metrics in an isolated Shadow DOM workspace beneath the native header.
- Load metric modules on demand, reuse the existing metrics controller, and cancel requests/remove listeners when closing.
- Preserve standalone pages and share dashboard preferences through a restricted background bridge; no general storage access is exposed.
- Keep the lightweight menu registration separate from board-only enhancements.
- Verify embedded open/close/reopen, board loading, standalone metrics and bridge authorization using mocks.


## 0.21.2 — 2026-10-18

- Keep loaded tasks with unconfirmed parent relationships under collapsible virtual parent-type groups instead of aborting the roadmap.
- Preserve descendants, issue links and data-quality warnings; virtual headings do not enter issue metrics or exports as fake issues.
- Continue rejecting ambiguous relationships and retain exact-parent verification.


## 0.21.1 — 2026-10-18

- Recover hierarchy links when Jira search omits or cannot serialize the configured parent field, including Epic Link.
- Verify each missing relationship with exact-parent JQL using the selected field; reject ambiguous or unconfirmed parents rather than guessing.
- Bound fallback checks to 100 per load and record recovered links in data-quality warnings.
- Add regression coverage for absent fields, confirmed links and ambiguous parents.


## 0.21.0 — 2026-10-18

- Organize roadmap into accessible tabs and collapse setup after loading.
- Overlay original Jira dates as dashed bars in local scenarios.
- Add approximate workload by week or sprint with separate period capacity and explicit missing estimates.
- Add validated, same-context backup/restore of missing local roadmap sections without overwriting existing data.
- Keep the default 2000-issue limit and allow an explicit 5000-issue load; verify 5000 issues and 4999 dependencies using paginated Jira mocks.
- Verify tabs, scenarios, backup and period flows in light and dark browser tests.


## 0.20.27 — 2026-10-18

- Add local what-if date overrides from the issue inspector without writing to Jira.
- Recalculate hierarchy rollups, deadline/cutoff risks and dependency conflicts on a cloned baseline; retain original sprint dates and statuses.
- Save/select/delete up to 20 local scenarios per release and return to the loaded Jira baseline.
- Mark scenario mode in full-screen navigation, exports, AI payloads and snapshots; validate scope/mapping compatibility on restore.
- Test baseline immutability, conflict recalculation and scenario persistence/browser flows.


## 0.20.26 — 2026-10-18

- Add roadmap progress by team at a selected hierarchy level, excluding parent/child double counting and external blockers.
- Support configurable Story Points field and Original Time Estimate hours; preserve unknown versus zero estimates and show weighted progress only with complete estimates.
- Add local whole-release capacity targets per team/type set/unit with explicit uncertainty for incomplete estimates.
- Verify mixed estimates, status completion, hour conversion, capacity persistence and browser flows in both themes.


## 0.20.25 — 2026-10-18

- Save and delete local roadmap baselines (up to 20 per server/project/version field/release).
- Compare a baseline with the loaded plan: membership, titles, hierarchy, statuses, teams, dates, sprints and blockers; show cutoff/release-date changes separately.
- Reject incompatible scopes/mappings and ignore ordering or load timestamps to avoid false changes.
- Display comparison direction, data timestamps and paginated differences with Jira links; document storage and comparison limits.


## 0.20.24 — 2026-10-18

- Explain roadmap risks with concrete deadline/cutoff dates, calendar-day overruns, child schedule drivers and missing end dates.
- Show explanations in the problem table and issue inspector, with clickable issue references.
- Explain dependency conflicts, cleared blockers and unavailable dates in the dependency table and inspector.
- Test same-day dependency conflicts, configured cleared statuses, missing data and browser rendering.


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
