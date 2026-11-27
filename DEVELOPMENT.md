# Jira Board Plus · 0.24.0

Chrome Manifest V3 extension for Jira Server. Independent board-and-plus logo; no company branding or built-in Jira server address.

## Установка и подключение

1. Распакуйте архив. В chrome://extensions включите режим разработчика → «Загрузить распакованное расширение» → выберите папку с manifest.json.
2. Пройдите мастер: введите полный HTTPS-адрес Jira и ключ проекта, настройте статусы и функции. Адрес по умолчанию пустой.
3. Предоставьте доступ выбранному домену и перезагрузите вкладки Jira. Для установки в подкаталоге включите его в URL: https://jira.example.com/jira — это только пример.
4. В меню доступны JQL-отчёт, метрики, инструменты, настройки, мастер и справка.

Расширение регистрирует дополнения только для настроенного адреса и пути Jira. Нет обязательного доступа ко всем сайтам. При смене адреса старая регистрация удаляется; открытые дополнения прежней Jira выключаются. Отчёты используют тот же адрес. На первой установке без настроек запросов в Jira нет. Для работы нужна активная сессия Jira в профиле браузера.

## Возможности

- Shared Team в Details на доске и в бэклоге: поиск, выбор и сохранение по клику/Enter. ID поля настраивается в разделе Team (по умолчанию customfield_10200); необходимы Plans / Advanced Roadmaps и права редактирования.
- Отключаемые метки daily, блокировок, добавления после старта спринта, времени в статусе и наличия билда. Анализ бэклога включается отдельно.
- JQL-запросы пользователя, колонки, расписание, сравнение результатов и уведомления. Предустановленных запросов нет.
- Метрики по доске/спринту, Story Points или Original Time Estimate, фильтры исполнителя и типа задачи.
- Дополнения Sprint Report, локальный экспорт JSON/Markdown/CSV и снимки.
- Refinement по выборке доски, спринта, бэклога или колонки канбан; настраиваемые проверки.
- История переносов, импорт и экспорт настроек команды.

Полная встроенная документация: help.html. Она работает без интернета. В исходниках также есть RETEST-*.md с ручными проверками по выпускам.

## Обновление

Обновите расширение и откройте настройки. Проверьте и сохраните адрес Jira, разрешите доступ, перезагрузите её вкладки. Если раньше использовался встроенный адрес без сохранения собственного, теперь потребуется ввести адрес. Настройки и результаты в локальном профиле не удаляются при замене файлов. Смена сервера очищает базу результатов JQL после подтверждения. Старые архивы выпусков не являются частью нового пакета.

## Проверка

node --test tests/*.test.cjs

Браузерные тесты требуют Playwright. Ответы Jira в тестах подставные. Автоматические проверки не обращаются к серверу пользователя. PNG-значок создаётся из локального SVG скриптом tests/render-brand-icon.cjs; внешние изображения и шрифты не используются.

## Личные заметки · 0.11.0

Отключаемая кнопка на карточках доски/бэклога, в Details и на странице задачи открывает модальное окно личных заметок. CRUD, подтверждение удаления, защита от конфликтов вкладок. Данные хранятся в storage.local по адресу Jira и ключу задачи, без запросов в Jira; тексты не входят в отчёты и экспорт профиля. Это приватность в рамках профиля браузера, а не отдельного аккаунта Jira. После обновления перезагрузите вкладки, затем включите функцию в настройках.

## Необязательный анализ через ИИ
В Настройках задайте OpenAI-совместимый Chat Completions endpoint (база API, например `/v1`, или полный `/chat/completions`), модель и при необходимости ключ. Включите отдельно кнопки доски/бэклога и Sprint Report/метрик. После сохранения обновите Jira. HTTP разрешён только для loopback; корпоративным серверам нужен HTTPS.

Кнопка открывает модальное окно с точным снимком перед отправкой. Нажмите «Отправить и анализировать». На доске используются видимые карточки; в Sprint Report — текущие фильтры загруженного спринта. Описания, полный changelog и личные заметки не передаются. Снимок может содержать названия задач и исполнителей. Ключ хранится локально и исключён из экспорта профиля. Сервер получает данные только по вашему действию; его политику хранения определяет администратор сервера. Анализ не записывается в Jira и не сохраняется расширением. Системный промпт редактируется; есть восстановление стандартного. Ожидание — до 120 секунд, предусмотрена отмена.

## Метрики Scrum / Kanban (0.11.0)
«Метрики команды» автоматически открывает общий обзор выбранной доски. Тип работы определяется доской и может быть изменён вручную. Kanban не обращается к списку спринтов.

- Общий обзор: WIP, старение, блокировки, завершённые блокеры, распределение по статусам и типам. Клик по показателю открывает задачи.
- История: 7/30/90 дней или до 366 дней, UTC, создание/завершение по неделям, lead/cycle time (медиана, P85), календарное время в незавершённых статусах. Неполная история явно отмечается.
- Scrum: сравнение 3/5/10 завершённых спринтов, первоначальный план, добавления, исключения, повторно незавершённые задачи. Поддерживаются SP, Original Time Estimate и отсутствие оценок.
- Активный Sprint Report: сворачиваемый список рисков, отключаемый через «Риски активного спринта».
- Фильтр по типу, подзадачи, WIP-лимит, порог возраста и чекбоксы разделов. Экспорт JSON и ИИ получают выбранный режим и определения.

Ограничения: текущий фильтр доски не является историческим составом; создание не равно попаданию на доску; нет реконструкции исторического WIP/роста очереди. Не более 3000 задач за загрузку. Время 24×7, без рабочего календаря/Timepiece. Переходы между двумя завершёнными статусами не считаются повторной доставкой; повторные закрытия одной задачи за период не удваивают throughput.

## Ответы ИИ (0.11.1)
Ответ модели отображается как форматированный Markdown: заголовки, выделение, списки, таблицы, цитаты, ссылки и блоки кода. HTML не исполняется; изображения не загружаются. Разрешены кликабельные HTTP/HTTPS-ссылки. Парсер Marked 17.0.5 включён локально, лицензия: src/vendor/marked-LICENSE.md.

## Графики и перцентили (0.12.0)
Шесть отключаемых SVG-графиков в метриках: создание/завершение по неделям, возраст незавершённых, время по статусам, scatter lead/cycle time, план спринтов и повторно незавершённые задачи. Графики локальные, без внешних библиотек/запросов; учитывают типы задач и подзадачи. Клик/Enter открывает список задач. Для длинных графиков — прокрутка; возраст/повторы показывают top-30 с явной подписью.

P50/P70/P80/P85: nearest rank, медиана отдельно. Выбранное значение обзора сохраняется для доски, применяется к таблицам, графикам, JSON и данным ИИ. Sprint Report имеет отдельный переключатель для текущего просмотра. Старые поля p85/p85Hours остаются в JSON для совместимости, выбранный перцентиль указан явно. Единицы плана (количество/SP/часы) не смешиваются. Неизвестные оценки — знак ?, не ноль.


## 0.13.0 — Роадмэп релиза

Отдельная вкладка для Component Product Owner: релиз проекта → настраиваемая иерархия (Component → Epic → Task по умолчанию). Поиск релизов и полей, Rank, Team, целевые даты и спринты, контроль Due Date фич, внешние блокеры и конфликты зависимостей. Потомки включаются без фильтра fix version. Только чтение; редактирование по ссылкам в Jira. Полная инструкция: встроенная справка → «Роадмэп релиза». Проверка: RETEST-0.13.0.md.


## 0.14.0 — Поля, правила и ИИ в роадмэпе

Отключаемое правило отсутствия спринта с выбором типов, до 30 дополнительных полей Jira с порядком отображения, экспорт JSON/Markdown и отдельное подключение анализа роадмэпа к настроенной модели. Исправлена доступность кнопки личных заметок под слоем карточки активного спринта. Ручная проверка: RETEST-0.14.0.md.


## 0.15.0 — Новый интерфейс

Общая система стилей с ролями цветов Material Design 3, светлой/тёмной системной темой, компактным меню 360×480, навигацией по разделам, поиском всех настроек, состояниями фокуса и закрываемыми уведомлениями. Без новых UI-библиотек, внешних шрифтов или сетевых ресурсов.

Источники темы: `src/ui-tokens.css`, `src/ui-pages.css`, `src/ui-shadow.css`. После изменения токенов или shadow-стилей выполните `node scripts/build-ui-theme.cjs` для пересборки `src/ui-theme.js`. Встроенные панели изолированы от стилей Jira. Бизнес-логика и формат сохранённых настроек не изменены. Ручная проверка: `RETEST-0.15.0.md`.


## 0.15.1 — Оформление внутри Jira

Встроенные Sprint Report, метки, подсказки, заметки и ИИ используют отдельный AUI-профиль `src/ui-jira.css`, активируемый только через `src/jira-theme.js` в content scripts. Отдельные вкладки и popup сохраняют Material-оформление. Поле Team сохраняет прежний компактный вид. Цветовые переменные AUI/DS наследуются через Shadow DOM; при их отсутствии применяется стандартная светлая палитра Jira, независимо от темы ОС. Пользовательские цвета рамок и заливки карточек не меняются.

Основа: [AUI Buttons](https://aui.atlassian.com/aui/9.0/docs/buttons.html), [AUI color variables](https://aui.atlassian.com/aui/9.7/docs/aui-colors.html). После изменения ui-jira.css также выполните `node scripts/build-ui-theme.cjs`. Соответствие кастомной корпоративной теме требует проверки на реальной Jira.


## 0.15.2 — Контраст мастера настройки

Исправлены фоны всех четырёх шагов мастера в тёмной теме: вложенные секции внутри формы теперь используют общие цвета поверхностей. Стили справки и мастера переведены на переменные темы. Регрессия проверяет фон и цвет заголовков каждого шага в обеих темах.


## 0.16.0 — Выбор Component/s перед релизом

В роадмэпе сначала выбираются одно или несколько значений стандартного поля Component/s из проекта, затем релиз. Поиск по части имени без учёта регистра, выбранные значения видны отдельными метками с удалением. Выбор хранится локально для сервера и проекта. Корневой JQL содержит component IN (…) и fixVersion; потомки не фильтруются по своим Component/s или релизам. Без выбранных компонентов чтение задач блокируется также в клиенте API. Лимит 2000 задач сохранён, сообщение предлагает сузить компоненты. Экспорт и ИИ включают сведения о выбранных компонентах.


## 0.16.1 — Fix Version / Affects Version

Роадмэп позволяет выбрать поле релиза: Fix Version (по умолчанию) или Affects Version. Выбор сохраняется для сервера/проекта; смена поля перезагружает выбранный релиз. Только корни фильтруются по Component/s и выбранному полю. В подробностях отображаются обе версии, экспорт и ИИ содержат versionField. JQL для затронутых версий: `affectedVersion`, REST-поле: `versions`. [Справочник JQL Atlassian](https://confluence.atlassian.com/jiracoreserver/advanced-searching-fields-reference-939937719.html).

## Разработка

Требуется Node.js 22 или новее. Проверка: `npm test`. После изменения CSS общей темы выполните `node scripts/build-ui-theme.cjs`. Браузерные сценарии находятся в tests/*.cjs и используют синтетические данные; Playwright и браузер устанавливаются отдельно. Корпоративную Jira при автоматических проверках не используйте.

В Chrome загрузите корень репозитория через chrome://extensions → Режим разработчика → Загрузить распакованное расширение. Не добавляйте в Git выгрузки Jira, ключи API и профили браузера.

Исходники: src/, страницы: *.html, иконки: icons/, тесты: tests/. Текущая версия определяется manifest.json.


### Browser regression suite

Run `npm ci`, `npx playwright install chromium`, then `npm run test:browser`. All scenarios use the Chromium version bundled with the pinned Playwright dependency; Chrome / Edge are optional overrides via `JBP_TEST_CHANNEL`. The suite runs 29 offline scenarios, continues after failures and returns a nonzero exit code if any fail. Tests use synthetic Jira responses; a successful run does not replace live integration testing. Screenshots are written to ignored `test-output/`.


## Нагрузка дополнений доски · 0.24.26

Проверка DOM каждые 15 секунд не означает запрос к Jira: данные карточек и состав спринта обновляются по истечении 5 минут. Перерисовка карточек Jira использует имеющийся кэш. Кнопка «Обновить» запрашивает свежие данные, но не обходит паузу после серверной ошибки. Новые карточки загружаются сразу.

Скрытие вкладки отменяет текущую загрузку и ожидание очереди. Уже обработанные карточки сохраняются в памяти вкладки. Вкладки одного origin используют Web Lock: одновременно выполняется один запрос дополнений доски, между запросами выдерживается 100 мс. При отсутствии Web Locks остаётся последовательная загрузка внутри вкладки. Кэш между вкладками не разделяется, данные задач не записываются в localStorage.

После 429/5xx, сетевой ошибки или таймаута действует пауза 1–15 минут с увеличением задержки при повторных ошибках. Retry-After может задать более долгую паузу. Пауза относится к текущей вкладке. Штатные запросы самой Jira, ручные метрики и расписания JQL не входят в эту очередь.

Проверка нагрузки: `node tests/board-load-browser.cjs`, десять вкладок с подставными ответами, без доступа к корпоративной Jira.


## Штатное обновление Jira · 0.25.0

В настройках «Обновление доски Jira» доступны режимы «Как в Jira», «Вручную» и «Автоматически · свой интервал» (30–3600 секунд). По умолчанию сохраняется штатный интервал Jira, но включена пауза в неактивных вкладках. Для возврата полного штатного поведения выберите «Как в Jira» и отключите паузу. Пауза означает document.hidden или отсутствие document.hasFocus(); окна на втором мониторе без фокуса также приостанавливаются.

Адаптер src/native-refresh-main.js регистрируется в MAIN world на document_start, только для RapidBoard.jspa настроенной Jira. Он перехватывает регистрацию GH.Poller.addPoller('WorkPoller', ...), сохраняя handler, context и исходный интервал. Прочие poller ID, fetch, XHR, события сохранения и глобальные таймеры не подменяются. Namespace assignment перехватывается до первой регистрации таймера. Если регистрация не захвачена (уже открытая вкладка, другая реализация Jira), UI показывает требование перезагрузки / возможную несовместимость, а не обещает блокировку.

Контракт проверен по официальному [jira-greenhopper-plugin 9.12.0](https://packages.atlassian.com/maven-public/com/atlassian/jira/plugins/jira-greenhopper-plugin/9.12.0/jira-greenhopper-plugin-9.12.0.jar): jira-agile/rapid/ops/Poller и jira-agile/rapid/ui/work/WorkController. Документированный источник 30-секундного интервала: [JRASERVER-69841](https://jira.atlassian.com/browse/JRASERVER-69841). Другие версии поддерживаются при совпадении контракта; Jira Cloud, dashboard gadgets и все прочие фоновые запросы в этот механизм не входят. Управление WorkPoller относится к активным Scrum/Kanban-доскам, а не к бэклогу.

Проверки вызывают handler(false): Jira показывает своё уведомление об изменениях и не перезаписывает редактор. Кнопка «Проверить Jira» запускает такую же проверку; применение новых данных выполняется штатным действием Jira. Уже отправленный запрос при уходе с вкладки может завершиться; новые проверки не запускаются. При возвращении выполняется максимум одна просроченная проверка, без накопления пропущенных тиков. Пока handler ожидает Promise/Deferred, следующая проверка не начинается. После ошибок действует увеличивающаяся пауза.

Конфигурация передаётся background-скриптом из локальных настроек через executeScript, после проверки origin/context path, top frame и URL доски. Публичное DOM-событие из MAIN world несёт только статус; его обработчик не запускает привилегированные команды. Доступ к настройкам и другим данным расширения из MAIN world не предоставляется.

Вручную: дополнения карточек загружаются впервые / для новых карточек / при смене правил, но не обновляются по возрасту кэша. Автоматически: интервал также задаёт TTL карточек; их локальная проверка устаревания выполняется каждые 15 секунд. Штатный режим: TTL дополнений остаётся 5 минут. JQL-расписания и пользовательские действия работают независимо.

Тесты: tests/native-refresh.test.cjs (включая десять вкладок) и tests/native-refresh-browser.cjs. Браузерный тест загружает временную копию расширения с host permission только на подставной домен, проверяет настоящий MAIN/ISOLATED bridge и настройки. Все Jira-ответы подставные, корпоративная Jira не вызывается.


## Capacity, поля родителей и транспорт сообщений · 0.26.0

`src/sprint-capacity.js` добавляет независимую загрузку диаграммы в Sprint Report и выбранный спринт метрик. До 10 спринтов, включая выбранный, предыдущие — закрытые по дате завершения. План: не добавленные после старта задачи, в том числе удалённые, по startEstimate. Завершено: category=completed, в том числе добавленные, по endEstimate. Типы текущие; историческое изменение типа не реконструируется. Подзадачи исключаются по паспорту. SP, часы и количество не смешиваются. Неизвестные оценки / недоступные задачи отмечены отдельно от нуля; таблица доступна без интерпретации цвета.

Загрузка только по кнопке. Каталог полей и конфигурация доски читаются один раз, отчёты — последовательно. Не более 3000 уникальных ключей, поиск по пакетам 50 с проверкой серверной пагинации, история переиспользуется между спринтами. В режиме количества changelog не запрашивается. Длинные загрузки отменяются при закрытии раздела, просроченный ответ не заменяет новую диаграмму. Фильтры исполнителей / типов текущего спринта не применяются к этой диаграмме; это указано в UI.

Поля на карточках берутся у выбранного предка: Epic по epicLinkField, либо Component через epicLinkField → componentLinkField. До 8 полей в заданном порядке, названия или ID. Настройки независимы от кнопки родителей, но используют те же связи. Запросы родителей имеют объединённый список полей и общий кэш в цикле active-board. Стиль и показ пустых значений меняют только отрисовку. Ошибка поля не скрывает остальные поля. Форматируются массивы, пользователи, select/cascading select, boolean и текст; HTML не исполняется. Попап строит безопасные ссылки для ключей Jira и HTTP(S) URL; содержимое никогда не присваивается innerHTML.

`src/runtime-messages.js` устанавливает Promise-обёртку только для сообщений UI расширения. Совпадающие безопасные чтения разделяют один незавершённый запрос; кеша ответов нет. Разрыв порта / канала допускает один повтор чтения; invalidated context сразу предлагает перезагрузить вкладку. Изменяющие операции, JQL run и aiAnalyze не повторяются. При неизвестном результате сохранения UI предлагает проверить состояние до повторной отправки. Быстрые boardPrefsGet, connectionGet, sprintStore profileGet/snapshotList и чтения отчётов выполняются вне serial-очереди сетевых задач; изменяющие операции остаются сериализованы. Это устраняет ожидание за медленным JQL, но не может запретить браузеру закрывать контекст при обновлении расширения или закрытии вкладки.

Тесты: capacity.test.cjs / capacity-browser.cjs, card-fields.test.cjs / card-fields-browser.cjs, runtime-messages.test.cjs и проверка заблокированной serial-очереди в reports.test.cjs. Jira полностью подставная.


### Team settings browser fixture

`tests/team-settings-browser.cjs` must load `settings-center.js` before `settings.js`, as the real settings page does. The settings center creates dynamic preference controls including `jiraStyle`; omitting it leaves initialization with a null control and prevents the Team directory request. The test now checks initialization errors before waiting for the field label.

Load the CSS linked by `settings.html` as well: without the combobox positioning rules its options occupy normal flow. Blurring the input then moves the save button during a click. This is a fixture layout error, not a failure of the extension's real settings page.

The mock persists `boardPrefsSet` patches for subsequent `boardPrefsGet` calls, supports the theme storage read, and verifies that only `teamField` is written. The real extension settings scenario (`settings-center-browser`) separately covers real storage, section saves and preservation of existing values. `JBP_TEST_CHANNEL=chromium` selects the bundled Playwright browser in every scenario and is the default. Chrome / Edge can be selected explicitly for additional compatibility checks; extension sideloading may not work in branded browsers.


### Browser CI and release gate

`.github/workflows/test.yml` runs unit tests and the complete browser suite on branch pushes, pull requests and manual dispatch. It also exposes `workflow_call` for the release workflow. Browser CI uses Ubuntu, Node.js 22, `npm ci` from the committed lockfile and `npx playwright install --with-deps chromium`; all Jira fixtures remain synthetic. Each browser scenario retains its 180-second timeout and the complete job has a 30-minute limit. A failed scenario makes the runner and job fail; no scenario is skipped or retried to hide a failure.

The `browser-results-<run_id>-<attempt>` artifact contains the combined `browser-suite.log` and screenshots from `test-output/`, retained for 14 days. Upload runs even if tests fail (when the runner is still available). Tests themselves use a read-only repository token and require no secrets.

`.github/workflows/release.yml` calls that same test workflow for the exact tag commit through `checks`. The publishing job has `needs: checks`: both unit and browser jobs must succeed before packaging or publishing. A failure or cancellation skips publication. Only the publishing job has `contents: write`; test jobs keep `contents: read`. Tag pushes do not start a duplicate standalone Tests run because Release already invokes it. This gate does not depend on another run's status or on the latest main commit.

When updating Playwright, update package.json and package-lock.json together and install its matching Chromium build before running all scenarios. Keep the lockfile root version consistent when bumping the extension package version.

### Automatic release gate regression tests

`release-gate-test.yml` runs on branch pushes and pull requests that change any workflow, CI helper, the gate contract test or package manifests; it also supports manual dispatch. Two independent calls of `release-gate-case.yml` run a real Chromium assertion: one passes, one deliberately fails after confirming that the browser fixture works. The full extension suite continues to run separately in Tests.

Both cases call `release-publish.yml`, the same reusable publication workflow used by real tagged releases. The shared job only runs for `checks_result == success`. In gate tests `dry_run: true` disables every packaging/publication step and emits a marker instead. Test callers have only `contents: read`, use no secrets, and never create tags or releases. Real Release retains `needs: checks`, passes the actual aggregate test result and explicitly sets `dry_run: false`.

Only the fault-injection assertion step uses `continue-on-error`; its original `outcome` (not its successful `conclusion`) is passed to the publication gate. The verifier requires the exact intentional-failure classification, so installation, startup or cleanup errors cannot masquerade as a passing negative case. Failed assertions must skip publication without a marker; passing assertions must execute it and produce the marker. An incorrect outcome fails CI. Each case saves observed statuses as a JSON artifact and job summary for 14 days.

`tests/release-gate.test.cjs` protects real Release wiring, read-only dry-run callers and publication-step guards. It also checks the verifier against an incorrectly opened gate, a permanently closed gate and infrastructure failures. Local checks: `npm test`, then `node scripts/ci/release-gate-browser.cjs` with `EXPECT_FAILURE=false` (exit 0) and `EXPECT_FAILURE=true` (exit 1). The latter nonzero exit is intentional only in this isolated probe; production browser tests never ignore failures.
