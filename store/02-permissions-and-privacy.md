# Разрешения и Privacy practices

Проверено по manifest.json и коду 0.24.25, 19 октября 2026 года. Это подготовка ответов для кабинета, не автоматическая отправка деклараций.

## Single purpose — готовый текст

Provide a unified workspace for viewing, organizing and analyzing the user's Jira Server / Data Center work: issue context, reports, delivery metrics and release plans, using the Jira server configured by the user.

## Обоснования разрешений — готовые тексты

| Permission | Justification |
| --- | --- |
| storage | Store user preferences, configured Jira connection, JQL definitions and results, private notes, snapshots and local release plans in this browser profile. Optional AI connection settings, including a user-supplied API key, are also stored locally. |
| unlimitedStorage | Retain user-requested issue snapshots, query results and release-plan backups that can exceed standard local extension storage quotas. No developer-hosted storage is used. |
| alarms | Schedule user-configured JQL queries and resume their scheduling when Chrome starts. |
| notifications | Show query names and counts of added, removed and changed issues for enabled notifications, plus a user-triggered test notification. |
| scripting | Add Board Plus controls and embedded pages to the configured Jira site, including Team editing and optional board annotations. |
| Optional host permissions | Jira installations and optional AI endpoints are chosen by the user and have no fixed domain. The extension requests permission for the configured origin. Jira uses HTTPS; AI also allows loopback HTTP for local models. The manifest's optional patterns do not automatically grant access to all sites. |

## Данные

Не используйте утверждение «расширение не обрабатывает данные». Важно отличать отсутствие отправки разработчику от обработки данных расширением.

Для декларации типов данных релевантны:

- **Website content:** данные задач и выбранные поля Jira, описания/история для соответствующих функций, пользовательский текст личных заметок.
- **Personally identifiable information:** имена и идентификаторы пользователей Jira, например исполнителей.
- **Authentication information:** необязательный API-ключ ИИ хранится локально и передаётся выбранному endpoint. Пароль Jira не собирается; сессию прикладывает браузер без чтения cookies через API расширения.

Не заявляйте отслеживание всей истории браузера, рекламы, геолокации, здоровья или финансовых операций: таких функций нет. Произвольное содержимое задач может включать сведения, внесённые пользователями. Встроенное чтение комментариев/задач не следует представлять как сканирование личной почты.

Локальная обработка также подлежит раскрытию. При заполнении кабинета сопоставьте точную формулировку каждого вопроса с PRIVACY.md. Данные не продаются, не используются для рекламы, кредитоспособности или целей вне функций расширения. У разработчика нет сервера приёма этих данных. Jira и выбранный сервер ИИ являются получателями соответствующих запросов.

## Remote code — готовый текст

No remotely hosted executable code is used. JavaScript, CSS, Markdown parsing and graph libraries are bundled with the extension. Jira and optional AI requests retrieve data, not executable scripts. Model output is rendered as formatted text; HTML is not executed.

## Публичные адреса

- Privacy policy: https://github.com/zevsariy/JiraBoardPlus/blob/main/PRIVACY.md
- Homepage: https://github.com/zevsariy/JiraBoardPlus
- Support: https://github.com/zevsariy/JiraBoardPlus/issues

## Источники Google

- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Изображения](https://developer.chrome.com/docs/webstore/images)

Актуальные правила и итоговое решение ревью определяет Google. Эта подготовка не является подтверждением одобрения магазина.
