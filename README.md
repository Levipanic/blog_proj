# StereoDamage Blog Project

> Старый README сохранен в отдельном файле: [README.legacy.md](./README.legacy.md).

`StereoDamage` - персональный microblog/art-blog с публичной лентой постов, комментариями, лайками, медиа-блоками и приватной админ-панелью для публикации.

Проект построен как MVP: минимум зависимостей, простой стек (Node.js + Express + SQLite + Vanilla JS), акцент на быстром запуске и контроле владельца сайта.

## Содержание

1. [Кратко о проекте](#кратко-о-проекте)
2. [Ключевые возможности](#ключевые-возможности)
3. [Технологический стек](#технологический-стек)
4. [Структура репозитория](#структура-репозитория)
5. [Быстрый старт (локально)](#быстрый-старт-локально)
6. [Конфигурация через .env](#конфигурация-через-env)
7. [Как пользоваться продуктом](#как-пользоваться-продуктом)
8. [Модель данных и инициализация БД](#модель-данных-и-инициализация-бд)
9. [Формат постов и блоков](#формат-постов-и-блоков)
10. [HTTP API](#http-api)
11. [Безопасность и ограничения](#безопасность-и-ограничения)
12. [Деплой в production](#деплой-в-production)
13. [Операционка: обновления, бэкапы, восстановление](#операционка-обновления-бэкапы-восстановление)
14. [Smoke-check после запуска](#smoke-check-после-запуска)
15. [Troubleshooting](#troubleshooting)
16. [Известные ограничения MVP](#известные-ограничения-mvp)

## Кратко о проекте

- Сайт с тремя основными страницами:
  - `/` - лента постов (новые сверху).
  - `/post.html?id=<id>` - отдельный пост + комментарии.
  - `/admin` - закрытая админка для входа, загрузки файлов и публикации.
- Публикация постов доступна только администратору (по `ADMIN_SECRET` + cookie-сессия).
- Посетители без регистрации могут:
  - читать посты,
  - ставить лайки,
  - оставлять комментарии.
- Контент постов хранится как JSON-массив блоков (`blocks_json`) в SQLite.

## Ключевые возможности

1. Публичная лента постов

- reverse chronological order;
- превью первого текстового абзаца;
- превью первого image/gif блока;
- лайк-кнопка прямо в ленте;
- превью последних комментариев.

1. Полная страница поста

- рендер блоков (`paragraph`, `heading`, `quote`, `divider`, `media`);
- поддержка `image/gif/video/audio/file`;
- форма комментария с honeypot-полем;
- безопасный рендер пользовательских данных.

1. Админ-панель `/admin`

- логин через `ADMIN_SECRET`;
- хранение сессии в `HttpOnly` cookie;
- загрузка файлов в `/uploads`;
- конструктор блоков поста;
- live preview перед публикацией;
- публикация поста через `POST /posts`.

1. Интернационализация и тема

- RU/EN переключение интерфейса (`frontend/i18n.js`);
- light/dark theme (`frontend/theme.js`);
- состояние языка/темы хранится в `localStorage`.

## Технологический стек

- Backend: `Node.js`, `Express 5`, `better-sqlite3`, `multer`, `express-rate-limit`, `dotenv`
- Frontend: `HTML`, `CSS`, `Vanilla JavaScript`
- База данных: `SQLite` (`data/blog.db`)
- Хранение файлов: локальная папка `uploads/`

## Структура репозитория

```text
blog_proj/
  backend/
    db.js            # работа с SQLite, schema init, seed
    server.js        # HTTP API, auth, rate-limit, upload, static
  frontend/
    index.html       # лента
    post.html        # страница поста
    admin.html       # админ-панель
    app.js           # клиентская логика ленты/поста
    admin.js         # клиентская логика админки
    i18n.js          # локализация RU/EN
    theme.js         # тема light/dark
    styles.css       # стили
  data/
    blog.db          # SQLite БД (создается автоматически)
  uploads/           # загруженные медиа и seed-файлы
  .env.example
  package.json
  README.md
  README.legacy.md
  SPEC.md
```

## Быстрый старт (локально)

### 1) Требования

- Node.js 18+ (рекомендуется Node.js 20 LTS)
- npm
- Доступ на запись в `data/` и `uploads/`

### 2) Установка

```bash
npm install
```

### 3) Подготовка окружения

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Отредактируйте `.env` и задайте надежный секрет:

```env
PORT=3000
ADMIN_SECRET=your-very-strong-random-secret
```

### 4) Запуск

Development:

```bash
npm run dev
```

Production-like (без watch):

```bash
npm start
```

После старта приложение доступно по адресу `http://localhost:3000` (или другому `PORT`).

### 5) Что происходит на первом запуске

- создаются папки `data/` и `uploads/` (если отсутствуют);
- создается SQLite БД `data/blog.db`;
- создаются таблицы `posts`, `comments`, `like_events`, `admin_sessions`;
- если таблица постов пустая, добавляются seed-посты и seed-медиа.

## Конфигурация через .env


| Переменная                   | По умолчанию   | Назначение                                                |
| ---------------------------- | -------------- | --------------------------------------------------------- |
| `PORT`                       | `3000`         | Порт HTTP-сервера                                         |
| `ADMIN_SECRET`               | `change-me`    | Секрет для входа в админку (обязательно сменить)          |
| `NODE_ENV`                   | -              | При `production` сессионный cookie получает флаг `Secure` |
| `ADMIN_SESSION_TTL_HOURS`    | `12`           | Время жизни админ-сессии                                  |
| `ADMIN_SESSION_HASH_SALT`    | `ADMIN_SECRET` | Соль хеширования токенов сессии                           |
| `ADMIN_LOGIN_RATE_LIMIT_MAX` | `6`            | Лимит попыток входа в админку за 15 минут с IP            |
| `LIKE_COOLDOWN_SECONDS`      | `10`           | Кулдаун повторного лайка одного поста с IP                |
| `LIKE_RATE_LIMIT_MAX`        | `20`           | Лимит запросов лайка за минуту с IP                       |
| `LIKE_IP_HASH_SALT`          | `ADMIN_SECRET` | Соль хеширования IP для таблицы лайков                    |


Примечание: лимит комментариев (`3/мин/IP`) сейчас захардкожен в коде (`commentLimiter`).

## Как пользоваться продуктом

### Сценарий 1: посетитель сайта

1. Открыть `/` и просмотреть ленту.
2. Нажать на карточку поста или ссылку открытия полной версии.
3. На странице `/post.html?id=<id>`:
  - прочитать полный контент,
  - поставить лайк,
  - оставить комментарий (имя опционально).

### Сценарий 2: администратор (публикация)

1. Открыть `/admin`.
2. Войти с `ADMIN_SECRET`.
3. Загрузить файл (кнопка upload).
4. При необходимости вставить медиа-блок из последней загрузки.
5. Собрать пост из блоков (абзацы, заголовки, цитаты, разделители, медиа).
6. Проверить live preview.
7. Нажать «Создать пост».

После успешной публикации новый пост появится в ленте.

## Модель данных и инициализация БД

### Таблицы

`posts`

- `id INTEGER PK AUTOINCREMENT`
- `title TEXT NOT NULL`
- `blocks_json TEXT NOT NULL`
- `likes_count INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`

`comments`

- `id INTEGER PK AUTOINCREMENT`
- `post_id INTEGER NOT NULL` (FK -> `posts.id`, `ON DELETE CASCADE`)
- `name TEXT NULL`
- `content TEXT NOT NULL`
- `created_at TEXT NOT NULL`

`like_events`

- `id INTEGER PK AUTOINCREMENT`
- `post_id INTEGER NOT NULL` (FK -> `posts.id`, `ON DELETE CASCADE`)
- `ip_hash TEXT NOT NULL`
- `created_at TEXT NOT NULL`

`admin_sessions`

- `id INTEGER PK AUTOINCREMENT`
- `token_hash TEXT NOT NULL UNIQUE`
- `created_at TEXT NOT NULL`
- `expires_at TEXT NOT NULL`

### Важный нюанс миграции

`initDb()` содержит «мягкую миграцию» старого формата таблицы `posts`: если не найден набор обязательных колонок, старые `posts/comments/like_events` удаляются и схема пересоздается.

Для production это означает: перед обновлениями обязательно делайте бэкап `data/blog.db`.

### Seed-данные

Если постов нет, при запуске добавляются:

- 3 seed-поста,
- seed-комментарии,
- файлы в `uploads/`:
  - `seed-sky.svg`
  - `seed-loop.gif`
  - `seed-guide.md`
  - `seed-tone.wav`

## Формат постов и блоков

### Поддерживаемые типы блоков

- `paragraph`
- `heading` (`level` только `1|2|3`)
- `quote`
- `divider`
- `media` (`mediaKind`: `image|gif|video|audio|file`)

### Валидация media-блока

- `src` обязан быть локальным путем вида `/uploads/...`;
- `name`, `alt`, `caption` - опциональные строки;
- внешние URL для `src` запрещены.

### Пример payload для публикации

```json
{
  "title": "Мой первый пост",
  "blocks": [
    { "type": "heading", "level": 2, "text": "Вступление" },
    { "type": "paragraph", "text": "Текст первого абзаца." },
    { "type": "quote", "text": "Короткая цитата." },
    { "type": "divider" },
    {
      "type": "media",
      "mediaKind": "image",
      "src": "/uploads/1730000000-example.png",
      "alt": "Описание изображения",
      "caption": "Подпись"
    }
  ]
}
```

## HTTP API

Ниже перечислены реальные endpoint'ы текущей версии.

### Админ-аутентификация

`POST /admin/login`

- body: `{ "secret": "..." }`
- при успехе: `200`, `Set-Cookie: admin_session=...; HttpOnly; SameSite=Lax`
- ограничения: rate limit `ADMIN_LOGIN_RATE_LIMIT_MAX` за 15 минут с IP

`POST /admin/logout`

- инвалидирует текущую сессию
- ответ: `{ "ok": true, "authenticated": false }`

`GET /admin/session`

- проверка статуса сессии
- ответ: `{ "authenticated": true|false, ... }`

### Посты

`GET /posts?limit=10&page=1`

- `limit`: 1..50 (default 10)
- `page`: >=1
- возвращает список с `preview_text` и `preview_media`

`GET /posts/:id`

- полный пост с распарсенными `blocks`

`POST /posts` (только админ-сессия)

- body: `{ title, blocks }`
- валидирует структуру блоков
- при успехе: `201` + созданный пост

### Лайки

`GET /posts/:id/likes`

- получить текущее количество лайков

`POST /posts/:id/like`

- публичный endpoint
- ограничения:
  - rate limit `LIKE_RATE_LIMIT_MAX`/мин/IP,
  - cooldown `LIKE_COOLDOWN_SECONDS` между лайками одного поста с одного IP
- при успехе: `{ success: true, postId, likes }`

### Комментарии

`GET /comments/:post_id?limit=...&order=asc|desc`

- `order`: `asc` (по умолчанию) или `desc`
- `limit`: опционально, максимум `20`

`POST /comments`

- body: `{ post_id, name?, content, website? }`
- `website` - honeypot (если заполнен, запрос отклоняется)
- rate limit: `3` комментария/мин/IP

### Загрузка файлов

`POST /upload` (только админ-сессия)

- `multipart/form-data`
- field name: `file`
- max size: `25MB`
- пустые файлы запрещены
- возвращает:

```json
{
  "url": "/uploads/1772987164317-59f60f746d5f5d09.gif",
  "originalName": "loop.gif",
  "storedName": "1772987164317-59f60f746d5f5d09.gif",
  "mediaKind": "gif"
}
```

### Пример API-сессии (curl)

```bash
# 1) Логин админа и сохранение cookie
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-very-strong-random-secret"}' \
  http://localhost:3000/admin/login

# 2) Загрузка файла
curl -i -b cookies.txt \
  -F "file=@./uploads/seed-guide.md" \
  http://localhost:3000/upload

# 3) Публикация поста
curl -i -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"title":"API post","blocks":[{"type":"paragraph","text":"Hello from API"}]}' \
  http://localhost:3000/posts
```

## Безопасность и ограничения

### Что уже реализовано

- Админ-маршруты защищены cookie-сессией.
- Сессионный токен хранится в БД в виде хеша (`token_hash`).
- `timingSafeEqual` для сравнения админ-секрета.
- `HttpOnly` cookie + `SameSite=Lax`.
- `Secure` cookie включается при `NODE_ENV=production`.
- Ограничения частоты запросов:
  - логин админа,
  - лайки,
  - комментарии.
- Honeypot-поле для антиспама комментариев.
- Валидация структуры блоков и медиа-путей.
- Рендер контента на фронте через безопасные DOM API (`textContent`, `createElement`).

### Что важно усилить в production

1. Установить длинный случайный `ADMIN_SECRET`.
2. Всегда запускать с `NODE_ENV=production` за HTTPS.
3. Закрыть прямой доступ к node-порту извне (доступ только через reverse proxy).
4. Настроить `X-Forwarded-For` на прокси так, чтобы клиент не мог подменить IP (пример ниже).
5. Регулярно делать бэкапы `data/blog.db` и `uploads/`.

## Деплой в production

Ниже практичный сценарий для Linux (Ubuntu) + `pm2` + `nginx` + HTTPS.

### 1) Подготовка сервера

```bash
sudo apt update
sudo apt install -y nginx

# Node.js ставьте LTS-версии (например, 20.x)
# способ установки зависит от вашей политики (nvm, distro packages, NodeSource)
```

### 2) Развернуть проект

```bash
# пример пути
sudo mkdir -p /var/www/stereodamage
sudo chown -R $USER:$USER /var/www/stereodamage

cd /var/www/stereodamage
# git clone <repo-url> .
npm install
cp .env.example .env
```

Заполните `.env` минимум так:

```env
PORT=3000
NODE_ENV=production
ADMIN_SECRET=<LONG_RANDOM_SECRET>
```

### 3) Запуск через PM2

```bash
npm i -g pm2
pm2 start backend/server.js --name stereodamage
pm2 save
pm2 startup
```

Полезные команды:

```bash
pm2 status
pm2 logs stereodamage
pm2 restart stereodamage
```

### 4) Reverse proxy (nginx)

Создайте `/etc/nginx/sites-available/stereodamage.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # ВАЖНО: перезаписываем X-Forwarded-For единичным IP,
        # чтобы клиент не присылал цепочку со spoofed первым адресом.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Активируйте конфиг:

```bash
sudo ln -s /etc/nginx/sites-available/stereodamage.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5) HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Проверьте автопродление:

```bash
sudo certbot renew --dry-run
```

### 6) Firewall (пример)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Операционка: обновления, бэкапы, восстановление

### Обновление приложения

```bash
cd /var/www/stereodamage
# git pull
npm install
pm2 restart stereodamage
```

### Бэкап

Минимальный набор для восстановления:

- `data/blog.db`
- папка `uploads/`
- файл `.env`

Пример:

```bash
tar -czf backup-$(date +%F).tar.gz data/blog.db uploads .env
```

### Восстановление

1. Остановить процесс (`pm2 stop stereodamage`).
2. Восстановить `data/blog.db`, `uploads/`, `.env`.
3. Запустить снова (`pm2 start stereodamage` или `pm2 restart stereodamage`).

## Smoke-check после запуска

Базовый чек-лист:

1. `GET /` отдает страницу ленты (`200`).
2. `GET /admin` открывает форму входа.
3. Логин с корректным `ADMIN_SECRET` успешен.
4. `POST /upload` после логина возвращает `201` и `url`.
5. `POST /posts` после логина создает пост (`201`).
6. Новый пост виден в `/posts` и на главной.
7. Публичный `POST /comments` работает.
8. `POST /posts/:id/like` увеличивает счетчик и применяет cooldown.

## Troubleshooting

### 1) `401 Admin login required.` на `/upload` или `/posts`

Причина: нет валидной cookie-сессии.

Что проверить:

- вызывался ли `POST /admin/login`;
- отправляются ли cookie (для fetch установлен `credentials: "same-origin"`, для curl нужен `-b cookies.txt`);
- не истекла ли сессия (`ADMIN_SESSION_TTL_HOURS`).

### 2) `401 Invalid admin secret.` при логине

- проверьте `ADMIN_SECRET` в `.env`;
- после изменения `.env` перезапустите процесс.

### 3) `413 File is too large.`

- лимит backend = 25MB;
- если используется nginx, проверьте `client_max_body_size` (должен быть >= 25m).

### 4) `429` на лайках или комментариях

Нормальная работа rate limit/cooldown.

- лайки: общий лимит + кулдаун для одного поста;
- комментарии: 3/мин/IP.

### 5) После очистки БД снова появились seed-посты

Это ожидаемо: если таблица `posts` пуста, `seedDb()` добавляет seed-контент при старте.

### 6) Неправильные IP в логике лайков/rate limit за прокси

Проверьте настройку `X-Forwarded-For` на reverse proxy. Для текущей реализации безопаснее перезаписывать заголовок единичным `$remote_addr`.

## Известные ограничения MVP

- Нет CRUD для постов через API (редактирование/удаление не реализованы).
- Нет учетных записей пользователей и ролей.
- Антиабуз лайков/комментариев опирается на IP (может обходиться через VPN/прокси).
- Нет встроенной панели модерации комментариев.
- Лимит комментариев не вынесен в env-переменную.
- Авто-seed контента при пустой БД не отключается конфигом.

## Лицензия и статус

Текущий код и документация ориентированы на MVP/личный блог с небольшим трафиком.