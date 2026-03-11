# StereoDamage Blog (MVP)

Актуальная документация проекта по текущему коду (`backend/server.js`, `backend/db.js`, `frontend/*`).

## Что это за проект

`StereoDamage` - минималистичный персональный блог:

- публичная лента постов;
- отдельная страница поста;
- комментарии с ответами (threaded);
- лайки;
- медиа-блоки (image/gif/video/audio/file);
- приватная админ-панель для публикации/удаления постов, удаления комментариев и загрузки файлов.

Стек без сборки фронтенда: `Node.js + Express + SQLite + Vanilla JS`.

## Реально доступные страницы

- `/` - лента постов.
- `/post.html?id=<postId>` - страница поста и комментарии.
- `/admin` - вход в админку и интерфейс публикации.

Дополнительно:

- статика из `frontend/` отдается напрямую;
- `/uploads/*` отдается как статический каталог;
- все остальные неизвестные маршруты отдают `frontend/index.html` (fallback роут).

## Ключевые функции

### Публичная часть

- Лента постов в обратной хронологии.
- Превью первого `paragraph` и первого медиа-блока.
- Инлайн-лайк на карточке поста.
- Превью последних комментариев:
  - desktop: до 2,
  - mobile: до 1.
- На странице поста:
  - полный рендер блоков;
  - древовидные комментарии;
  - ответ на комментарий (`parent_id`);
  - сворачивание длинных комментариев.

### Админка

- Логин по `ADMIN_SECRET`.
- Cookie-сессия (`admin_session`, `HttpOnly`, `SameSite=Lax`, `Secure` только в `NODE_ENV=production`).
- Загрузка файла (`POST /upload`, multipart).
- Визуальный конструктор блоков поста.
- Live preview поста.
- Публикация поста.
- Удаление постов.
- Удаление комментариев (рекурсивно удаляется ветка ответов).

### UI/UX

- RU/EN интерфейс (`frontend/i18n.js`).
- Переключение темы light/dark (`frontend/theme.js`).
- Глобальный аудио-плеер:
  - общий playback state для всех аудио-блоков;
  - мини-плеер;
  - попытка построения waveform через Web Audio API;
  - сохранение состояния в `sessionStorage`.

## Технологии

- Backend:
  - `express@5`
  - `better-sqlite3`
  - `multer`
  - `express-rate-limit`
  - `dotenv`
- Frontend:
  - `HTML`, `CSS`, `Vanilla JS`
- Database:
  - `SQLite` (`data/blog.db`)
- Media storage:
  - локальная папка `uploads/`

## Структура репозитория

```text
blog_proj/
  backend/
    db.js          # SQLite init/schema и простые DB-обертки
    server.js      # API, auth, upload, rate-limits, статика
  frontend/
    index.html     # лента
    post.html      # страница поста
    admin.html     # админка
    app.js         # общая клиентская логика + feed/post + аудио
    admin.js       # клиентская логика админки
    i18n.js        # RU/EN словари и перевод ошибок API
    theme.js       # переключение темы
    styles.css
  data/
    .gitkeep       # SQLite файл создается в runtime
  uploads/
    .gitkeep       # загруженные файлы (не коммитятся)
  package.json
  package-lock.json
  README.md
```

## Требования

- Node.js 18+ (рекомендуется Node.js 20 LTS).
- npm.
- Права на запись в `data/` и `uploads/`.

## Быстрый старт

### 1) Установка зависимостей

```bash
npm install
```

### 2) Создайте `.env` вручную

В репозитории сейчас **нет** `.env.example`, поэтому создайте файл `.env` сами.

Минимальный вариант:

```env
PORT=3000
ADMIN_SECRET=replace-with-strong-secret
NODE_ENV=development
```

### 3) Запуск

Development (watch):

```bash
npm run dev
```

Production-like:

```bash
npm start
```

Сервер поднимется на `http://localhost:<PORT>`.

### 4) Что создается автоматически

При старте:

- создаются каталоги `data/` и `uploads/` (если отсутствуют);
- создается файл `data/blog.db` (если отсутствует);
- создаются таблицы/индексы SQLite.

Важно: в текущем коде **нет авто-seed** постов/комментариев.

## Скрипты npm

- `npm start` -> `node backend/server.js`
- `npm run dev` -> `node --watch backend/server.js`

## Конфигурация `.env` (полная)

Все числовые параметры читаются как положительные числа; невалидные значения откатываются к fallback.

### Базовые

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `PORT` | `3000` | Порт HTTP-сервера |
| `ADMIN_SECRET` | `change-me` | Секрет логина в админку |
| `NODE_ENV` | `development` (если не задан) | Влияет на флаг `Secure` у cookie |
| `TRUST_PROXY` | `false` | `app.set("trust proxy", ...)`; принимает `1/0`, `true/false`, `yes/no`, `on/off` |

### Ограничения тела запроса

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `JSON_BODY_LIMIT` | `256kb` | `express.json({ limit })` |
| `URLENCODED_BODY_LIMIT` | `64kb` | `express.urlencoded({ limit })` |
| `URLENCODED_PARAMETER_LIMIT` | `100` | `parameterLimit` для URL-encoded форм |

### Глобальный API rate limit

Применяется к префиксам: `/posts`, `/comments`, `/upload`, `/admin`.

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `GLOBAL_API_RATE_LIMIT_WINDOW_SECONDS` | `60` | Окно лимита |
| `GLOBAL_API_RATE_LIMIT_MAX` | `240` | Макс. запросов на IP за окно |

### Лайки

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `LIKE_COOLDOWN_SECONDS` | `10` | Минимальный интервал повторного лайка одного поста с одного IP |
| `LIKE_RATE_LIMIT_MAX` | `20` | Лимит `POST /posts/:id/like` на IP за минуту |
| `LIKE_IP_HASH_SALT` | `ADMIN_SECRET` | Соль для SHA-256 хеша IP в `like_events` |

### Комментарии: валидация и антиспам

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `COMMENT_MAX_NAME_LENGTH` | `80` | Макс. длина имени |
| `COMMENT_MAX_LENGTH` | `1000` | Макс. длина текста комментария |
| `COMMENT_MAX_URL_COUNT` | `4` | Макс. число URL-маркеров (`http(s)://`, `www.`) |
| `COMMENT_MAX_TOKEN_LENGTH` | `120` | Макс. длина одного whitespace-token |
| `COMMENT_MAX_REPEATED_CHAR_RUN` | `18` | Повтор одного символа подряд |
| `COMMENT_MAX_REPEATED_SYMBOL_RUN` | `10` | Повтор emoji/символа подряд (дополнительно ограничен `COMMENT_MAX_REPEATED_CHAR_RUN`) |
| `COMMENT_MAX_REPEATED_TOKEN_RUN` | `12` | Повтор одного token подряд |
| `COMMENT_RANDOM_TEXT_MIN_LENGTH` | `120` | Порог длины для проверки на random/automated text |
| `COMMENT_RANDOM_TOKEN_MIN_LENGTH` | `12` | Мин. длина token для random-детектора |
| `COMMENT_RANDOM_TOKEN_MIN_COUNT` | `4` | Мин. число suspicious-token для random-детектора |
| `COMMENT_RANDOM_TOKEN_MIN_SHARE` | `0.5` | Доля suspicious-token для random-детектора |
| `COMMENT_LOW_TOKEN_DIVERSITY_MIN_TOKEN_COUNT` | `24` | Нижний порог token-count для low-diversity проверки |
| `COMMENT_LOW_TOKEN_DIVERSITY_CONTENT_MIN_LENGTH` | `180` | Нижний порог длины текста для low-diversity проверки |
| `COMMENT_LOW_TOKEN_DIVERSITY_THRESHOLD` | `0.14` | Порог разнообразия token |

### Комментарии: лимиты частоты

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `COMMENT_ATTEMPT_RATE_LIMIT_WINDOW_SECONDS` | `60` | Окно express-rate-limit на POST `/comments` |
| `COMMENT_ATTEMPT_RATE_LIMIT_MAX` | `40` | Макс. попыток комментариев на IP за окно |
| `COMMENT_COOLDOWN_SECONDS` | `12` | Персональный cooldown между успешными комментариями с IP |
| `COMMENT_BURST_WINDOW_SECONDS` | `60` | Окно burst-контроля с IP |
| `COMMENT_BURST_MAX` | `6` | Макс. успешных комментариев с IP за burst-окно |
| `COMMENT_DUPLICATE_WINDOW_SECONDS` | `180` | Блок одинакового комментария (post + normalized content) с IP |
| `COMMENT_POST_RATE_LIMIT_WINDOW_SECONDS` | `120` | Окно общего лимита на один пост |
| `COMMENT_POST_RATE_LIMIT_MAX` | `30` | Макс. комментариев к одному посту за окно |
| `COMMENT_GLOBAL_RATE_LIMIT_WINDOW_SECONDS` | `60` | Глобальное окно по всем постам |
| `COMMENT_GLOBAL_RATE_LIMIT_MAX` | `120` | Макс. комментариев глобально за окно |

### Посты

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `POST_MAX_BLOCKS` | `60` | Макс. число блоков в посте |
| `POST_MAX_TEXT_LENGTH` | `4000` | Макс. длина `text` для paragraph/quote/heading |
| `POST_MAX_MEDIA_TEXT_LENGTH` | `500` | Макс. длина `name`, `alt`, `caption` в media блоке |

### Админка и сессии

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `ADMIN_POST_RATE_LIMIT_WINDOW_SECONDS` | `300` | Окно лимита создания постов |
| `ADMIN_POST_RATE_LIMIT_MAX` | `12` | Макс. `POST /posts` за окно |
| `ADMIN_SESSION_TTL_HOURS` | `12` | TTL cookie-сессии |
| `ADMIN_SESSION_HASH_SALT` | `ADMIN_SECRET` | Секрет HMAC-подписи payload сессии |
| `ADMIN_SESSION_CLOCK_SKEW_SECONDS` | `60` | Допуск по времени для `iat/exp` |
| `ADMIN_LOGIN_RATE_LIMIT_MAX` | `6` | Лимит логинов (`POST /admin/login`) за 15 минут на IP |

## Аутентификация админа: как устроено сейчас

### Механика

- При логине сервер проверяет `secret` через `crypto.timingSafeEqual`.
- Генерируется payload сессии:
  - `v`, `iat`, `exp`, `nonce`.
- Payload кодируется в Base64URL и подписывается HMAC-SHA256.
- Клиент получает cookie `admin_session=<payload>.<signature>`.
- Для приватных эндпоинтов сервер валидирует подпись и сроки (`iat/exp`).

### Важный нюанс текущей реализации

В БД есть таблица `admin_sessions`, но в текущей версии:

- `deleteExpiredAdminSessions()` - заглушка (`return`);
- `deleteAdminSessionByToken()` - заглушка (`return`);
- сервер не хранит/не проверяет active sessions в БД.

Итого: logout очищает cookie у клиента, но сервер-side revoke токена сейчас не реализован.

## SQLite: схема данных

### Таблицы

`posts`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `title TEXT NOT NULL`
- `blocks_json TEXT NOT NULL`
- `likes_count INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`

`comments`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `post_id INTEGER NOT NULL` -> FK `posts(id)` `ON DELETE CASCADE`
- `parent_id INTEGER NULL` -> FK `comments(id)` `ON DELETE CASCADE`
- `name TEXT NULL`
- `content TEXT NOT NULL`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`

`like_events`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `post_id INTEGER NOT NULL` -> FK `posts(id)` `ON DELETE CASCADE`
- `ip_hash TEXT NOT NULL`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`

`admin_sessions`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `token_hash TEXT NOT NULL UNIQUE`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`
- `expires_at TEXT NOT NULL`

### Индексы

- `idx_comments_post_parent (post_id, parent_id, id)`
- `idx_like_events_post_ip_created (post_id, ip_hash, created_at)`
- `idx_admin_sessions_expires_at (expires_at)`

### Инициализация и миграционные нюансы

- `PRAGMA foreign_keys = ON`.
- Если таблица `posts` существует, но в ней нет обязательных колонок
  (`id`, `title`, `blocks_json`, `created_at`), то `posts/comments/like_events` дропаются и создаются заново.
- Отдельно выполняются "мягкие" `ALTER TABLE` для добавления:
  - `posts.likes_count`,
  - `comments.parent_id`.

## Формат поста (`blocks`)

Допустимые типы блоков:

- `paragraph` -> `{ type: "paragraph", text }`
- `heading` -> `{ type: "heading", level: 1|2|3, text }`
- `quote` -> `{ type: "quote", text }`
- `divider` -> `{ type: "divider" }`
- `media` -> `{ type: "media", mediaKind, src, name?, alt?, caption? }`

`mediaKind`:

- `image`, `gif`, `video`, `audio`, `file`

Ключевые ограничения:

- `title` до 160 символов.
- `blocks` - массив от 1 до `POST_MAX_BLOCKS` (по умолчанию 60).
- `text` для paragraph/quote/heading до `POST_MAX_TEXT_LENGTH` (по умолчанию 4000).
- Для `media`:
  - `src` строго локальный `/uploads/...`;
  - `name/alt/caption` по `POST_MAX_MEDIA_TEXT_LENGTH` (по умолчанию 500).

## HTTP API (актуально)

Базовый адрес: `http://localhost:<PORT>`.

### 1) Admin auth

#### `POST /admin/login`

Body:

```json
{ "secret": "..." }
```

Success `200`:

```json
{
  "ok": true,
  "authenticated": true,
  "expires_in_seconds": 43200,
  "created_at": "2026-03-12 00:00:00",
  "expires_at": "2026-03-12 12:00:00"
}
```

Ошибки:

- `400` - `Admin secret is required.`
- `401` - `Invalid admin secret.`
- `429` - при rate-limit логина или глобальном API лимите

#### `POST /admin/logout`

Success `200`:

```json
{ "ok": true, "authenticated": false }
```

#### `GET /admin/session`

Success:

- не авторизован:

```json
{ "authenticated": false }
```

- авторизован:

```json
{
  "authenticated": true,
  "created_at": "2026-03-12 00:00:00",
  "expires_at": "2026-03-12 12:00:00"
}
```

### 2) Posts

#### `GET /posts?limit=10&page=1`

- `limit`: от 1 до 50 (default 10)
- `page`: >= 1

Success `200`:

```json
{
  "items": [
    {
      "id": 1,
      "title": "Post title",
      "likes": 3,
      "created_at": "2026-03-11 16:05:55",
      "preview_text": "First paragraph text...",
      "preview_media": {
        "mediaKind": "image",
        "src": "/uploads/...",
        "alt": "",
        "caption": "",
        "name": ""
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

#### `GET /posts/:id`

Success `200`:

```json
{
  "id": 1,
  "title": "Post title",
  "likes": 3,
  "created_at": "2026-03-11 16:05:55",
  "blocks": [ ... ]
}
```

Ошибки:

- `404` - `Post not found.`

#### `POST /posts` (admin only)

Body:

```json
{
  "title": "My post",
  "blocks": [{ "type": "paragraph", "text": "Hello" }]
}
```

Success `201` -> возвращает созданный пост.

Ошибки:

- `401` - `Admin login required.`
- `400` - `Invalid post payload.` + `details[]`
- `429` - превышен `ADMIN_POST_RATE_LIMIT_*` или глобальный API лимит

#### `DELETE /posts/:id` (admin only)

Success `200`:

```json
{ "ok": true, "id": 1 }
```

Ошибки:

- `401` - `Admin login required.`
- `400` - `Invalid post id.`
- `404` - `Post not found.`

### 3) Comments

#### `GET /comments/:post_id?order=asc|desc&limit=N`

- `order`: `asc` (default) или `desc`
- `limit`: опционально, максимум 20

Возвращает плоский массив комментариев с `parent_id`; дерево строится на фронте.

#### `POST /comments`

Требует `Content-Type: application/json`.

Body:

```json
{
  "post_id": 1,
  "parent_id": 10,
  "name": "User",
  "content": "Text",
  "website": ""
}
```

Поля:

- `post_id` - обязателен, положительный int.
- `parent_id` - опционален, если задан, должен существовать и принадлежать тому же `post_id`.
- `name` - опционально.
- `content` - обязателен, проходит антиспам/валидацию.
- `website` - honeypot (должен быть пустым).

Success `201`:

```json
{ "ok": true }
```

Основные ошибки:

- `415` - `Unsupported content type. Please send JSON.`
- `400` - невалидные поля / антиспам-проверки / honeypot
- `404` - пост или родительский комментарий не найден
- `429` - один из rate-limit/duplicate/cooldown барьеров

#### `DELETE /comments/:id` (admin only)

Рекурсивно удаляет комментарий и все дочерние ответы через `WITH RECURSIVE`.

Success `200`:

```json
{ "ok": true, "id": 15, "post_id": 1 }
```

### 4) Likes

#### `GET /posts/:id/likes`

Success:

```json
{ "postId": 1, "likes": 5 }
```

#### `POST /posts/:id/like`

Success:

```json
{ "success": true, "postId": 1, "likes": 6 }
```

Ошибки:

- `400` - `Invalid post id.`
- `404` - `Post not found.`
- `429` - rate-limit/cooldown

Дополнительно:

- после лайка сервер удаляет записи `like_events` старше 14 дней.

### 5) Upload

#### `POST /upload` (admin only)

- `multipart/form-data`
- поле файла: `file`
- лимит размера: 25 MB

Success `201`:

```json
{
  "url": "/uploads/<stored-filename>",
  "originalName": "my-file.png",
  "storedName": "1772989610340-168c44a1e4cc8288.png",
  "mediaKind": "image"
}
```

Ошибки:

- `401` - `Admin login required.`
- `400` - `file is required.` / `Empty file uploads are not allowed.`
- `413` - `File is too large. Max size is 25MB.`

## Пример API-сценария через curl

```bash
# 1) Логин и сохранение cookie
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"replace-with-strong-secret\"}" \
  http://localhost:3000/admin/login

# 2) Загрузка файла
curl -i -b cookies.txt \
  -F "file=@./some-local-file.png" \
  http://localhost:3000/upload

# 3) Создание поста
curl -i -b cookies.txt \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"API post\",\"blocks\":[{\"type\":\"paragraph\",\"text\":\"Hello\"}]}" \
  http://localhost:3000/posts
```

## Поведение фронтенда

### `frontend/app.js`

- Общая логика для `feed` и `post` страниц.
- Проверка админ-сессии для отображения кнопок удаления и logout в topbar.
- Лайки через `POST /posts/:id/like`.
- Комментарии:
  - создание комментариев;
  - ответы с `parent_id`;
  - построение дерева из плоского списка.
- Отрисовка блоков поста через DOM API без вставки HTML от пользователя.
- Аудио-плеер:
  - один глобальный `Audio()` объект;
  - синхронизация между карточками;
  - мини-плеер;
  - lazy waveform.

### `frontend/admin.js`

- Только для страницы `/admin`.
- Логин/логаут.
- Upload.
- Блочный редактор черновика:
  - добавить/удалить/переместить блоки;
  - редактировать поля блока;
  - формировать JSON.
- Live preview:
  - переиспользует функции `normalizeClientBlock` и `renderPostBlock` из `app.js`.
- Публикация поста через `POST /posts`.

### `frontend/i18n.js`

- Словари `ru` и `en`.
- Сохранение языка в `localStorage` (`stereoDamageLanguage`).
- Переводит многие backend error strings в RU.
- При смене языка страница перезагружается.

### `frontend/theme.js`

- Тема light/dark.
- Сохранение выбора в `localStorage` (`stereoDamageTheme`).
- Если выбор не сохранен, берется системная тема (`prefers-color-scheme`).

## Безопасность и ограничения (фактически реализованное)

### Реализовано

- `x-powered-by` отключен.
- Заголовки:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: same-origin`
- Cookie админа `HttpOnly`, `SameSite=Lax`.
- `Secure` cookie в `production`.
- Валидация структуры постов и локальных media path (`/uploads/...`).
- Валидация и многоступенчатая антиспам-фильтрация комментариев.
- Несколько уровней rate-limit (global, login, likes, comments, post-create).

### Ограничения текущей версии

- Нет пользовательских аккаунтов и ролей.
- Нет редактирования постов (только create/delete).
- Logout не делает сервер-side revoke токена (см. нюанс про `admin_sessions`).
- Часть антиспам-состояния комментариев хранится in-memory `Map`:
  - сбрасывается при рестарте процесса;
  - не шарится между инстансами при горизонтальном масштабировании.
- Нет встроенных тестов.

## Продакшен-заметки

### Минимальные рекомендации

1. Обязательно задайте сильный `ADMIN_SECRET`.
2. Используйте HTTPS и `NODE_ENV=production`.
3. При reverse proxy настройте `TRUST_PROXY=true` и корректный `X-Forwarded-For`.
4. Ограничьте доступ к node-порту извне.
5. Делайте регулярные бэкапы `data/blog.db`, `uploads/`, `.env`.

### Поведение с дефолтным секретом

- Если `ADMIN_SECRET=change-me` и `NODE_ENV=production`, сервер завершится с ошибкой старта.
- В development только пишет warning в лог.

## Бэкап и восстановление

### Что бэкапить

- `data/blog.db`
- `uploads/`
- `.env`

### Пример

```bash
tar -czf backup-$(date +%F).tar.gz data/blog.db uploads .env
```

### Восстановление

1. Остановить процесс.
2. Восстановить `blog.db`, `uploads`, `.env`.
3. Запустить процесс снова.

## Быстрый smoke-check

1. `GET /` -> открывается лента.
2. `GET /admin` -> форма логина.
3. `POST /admin/login` с корректным секретом -> `200` и cookie.
4. `POST /upload` (с cookie) -> `201`.
5. `POST /posts` (с cookie) -> `201`.
6. `GET /posts` -> новый пост в выдаче.
7. `POST /comments` -> `201`.
8. `POST /posts/:id/like` -> счетчик растет, повторный быстрый лайк -> `429`.

## Частые проблемы

### `401 Admin login required.`

Причина: нет валидной cookie-сессии.

Проверьте:

- был ли `POST /admin/login`;
- отправляются ли cookie в запросе;
- не истек ли TTL сессии.

### `415 Unsupported content type. Please send JSON.`

Причина: `POST /comments` принимает только JSON.

### `413 File is too large. Max size is 25MB.`

Причина: превышен лимит upload backend (и/или лимит на прокси).

### Лайки/комментарии получают `429`

Сработал один из rate-limit/cooldown механизмов.

## Важные отличия от старой документации

- В репозитории сейчас нет `.env.example`.
- В коде сейчас нет авто-seed постов в пустую БД.
- Реализованы `DELETE /posts/:id` и `DELETE /comments/:id`.
- Комментарии поддерживают `parent_id` (древовидные ответы).
- Защита комментариев намного шире, чем "простой лимит 3/мин".
