(function initI18n() {
  const STORAGE_KEY = "stereoDamageLanguage";
  const DEFAULT_LANGUAGE = "ru";
  const SUPPORTED_LANGUAGES = new Set(["ru", "en"]);

  const TRANSLATIONS = {
    ru: {
      "brand.name": "StereoDamage",
      "title.feed": "StereoDamage - Лента",
      "title.post": "StereoDamage - Пост",
      "title.postWithName": "StereoDamage - {title}",
      "title.admin": "StereoDamage - Админка",
      "nav.mainAria": "Основная навигация",
      "nav.home": "Главная",
      "nav.post": "Пост",
      "nav.admin": "Постинг",
      "nav.adminPanel": "Постинг",
      "nav.logout": "Выйти",
      "lang.switcherAria": "Переключение языка",
      "theme.label": "Тема: {theme}",
      "theme.light": "Светлая",
      "theme.dark": "Темная",
      "theme.switchTo": "Переключить на тему: {theme}",
      "common.requestFailed": "Ошибка запроса.",
      "common.anonymous": "Анон",
      "common.file": "файл",
      "common.postMedia": "Медиа поста",
      "audio.trackFallback": "Аудио-вложение",
      "audio.play": "Плей",
      "audio.pause": "Пауза",
      "audio.playAria": "Запустить аудио",
      "audio.pauseAria": "Поставить аудио на паузу",
      "audio.seekAria": "Перемотать аудио",
      "audio.loadingMetadata": "Загрузка аудио...",
      "audio.preparingWaveform": "Подготовка формы волны...",
      "audio.unavailable": "Аудио недоступно.",
      "audio.waveformFallback": "Waveform недоступен, показан обычный прогресс.",
      "audio.playFailed": "Не удалось запустить воспроизведение.",
      "audio.closePlayer": "Закрыть плеер",
      "feed.title": "Посты",
      "feed.subtitle": "Обратная хронология",
      "feed.loading": "Загрузка ленты...",
      "feed.loadError": "Не удалось загрузить ленту.",
      "feed.empty": "Постов пока нет.",
      "feed.summary": "{count} пост(ов), сначала новые.",
      "feed.untitled": "Пост без названия",
      "feed.noPreview": "Нет текстового превью.",
      "feed.mediaAttachment": "Вложение",
      "feed.mediaVideo": "Видео-вложение",
      "feed.mediaFile": "Файл во вложении",
      "feed.noReplies": "Комментариев пока нет.",
      "feed.openFull": "Открыть пост и все комментарии",
      "feed.like": "Лайк",
      "feed.likeAria": "Поставить лайк этому посту",
      "feed.likeCount": "{count} лайк(ов)",
      "feed.sending": "Отправка...",
      "feed.likeSuccess": "Спасибо! Лайк сохранен.",
      "feed.likeTooFast": "Подождите перед следующим лайком.",
      "feed.likeMissing": "Пост больше не существует.",
      "feed.likeError": "Не удалось сохранить лайк.",
      "post.loading": "Загрузка поста...",
      "post.loadError": "Не удалось загрузить пост.",
      "post.invalidId": "Некорректный id поста.",
      "post.back": "<- Назад к ленте",
      "post.comments": "Комментарии",
      "post.nameLabel": "Имя (необязательно)",
      "post.namePlaceholder": "Анон",
      "post.commentLabel": "Комментарий",
      "post.commentPlaceholder": "Оставьте сообщение...",
      "post.reply": "Ответить",
      "post.cancelReply": "Отмена",
      "post.replyPlaceholder": "Напишите ответ...",
      "post.sendReply": "Отправить ответ",
      "post.websiteLabel": "Сайт",
      "post.send": "Отправить комментарий",
      "post.commentSending": "Отправка...",
      "post.commentPosted": "Комментарий опубликован.",
      "post.replyPosted": "Ответ опубликован.",
      "post.replyRequired": "Текст ответа обязателен.",
      "post.commentError": "Не удалось отправить комментарий.",
      "post.emptyBlocks": "В этом посте нет читаемых блоков.",
      "post.fileAttached": "Прикрепленный файл",
      "post.noComments": "Комментариев пока нет. Напишите первым.",
      "post.showMore": "Показать полностью",
      "post.showLess": "Свернуть",
      "admin.title": "Админка",
      "admin.subtitle": "Войдите один раз, затем загружайте файлы и создавайте посты.",
      "admin.loginTitle": "Вход в админку",
      "admin.secretLabel": "Админ-секрет",
      "admin.secretPlaceholder": "Введите ADMIN_SECRET",
      "admin.loginButton": "Войти",
      "admin.sectionUpload": "1) Загрузка файла",
      "admin.fileLabel": "Файл",
      "admin.uploadButton": "Загрузить",
      "admin.insertMedia": "Добавить как новый медиа-блок",
      "admin.sectionCreate": "2) Создать пост",
      "admin.postTitleLabel": "Заголовок поста",
      "admin.postTitlePlaceholder": "Заголовок поста",
      "admin.addBlockAria": "Добавить блок",
      "admin.addParagraph": "Добавить абзац",
      "admin.addHeading": "Добавить заголовок",
      "admin.addQuote": "Добавить цитату",
      "admin.addDivider": "Добавить разделитель",
      "admin.addMedia": "Добавить медиа",
      "admin.emptyBlocks": "Блоков пока нет. Добавьте первый.",
      "admin.rawJson": "Сырый JSON блоков (отладка)",
      "admin.createPost": "Создать пост",
      "admin.clearDraft": "Очистить черновик",
      "admin.preview": "Предпросмотр",
      "admin.previewPlaceholder": "Добавьте заголовок и блоки для предпросмотра.",
      "admin.exampleJson": "Пример JSON блоков",
      "admin.previewUntitled": "Пост без названия",
      "admin.sessionNeedLogin": "Войдите, чтобы открыть инструменты админа.",
      "admin.sessionActive": "Сессия админа активна.",
      "admin.loggedInMessage": "Вход выполнен. Можно загружать файлы и публиковать посты.",
      "admin.loginPrompt": "Войдите с ADMIN_SECRET для доступа к админке.",
      "admin.sessionCheckFailed": "Не удалось проверить сессию админа. Повторите попытку.",
      "admin.forceLogin": "Пожалуйста, войдите как админ.",
      "admin.secretRequired": "Нужен админ-секрет.",
      "admin.loggingIn": "Выполняется вход...",
      "admin.loginFailed": "Ошибка входа.",
      "admin.loginRequired": "Требуется вход в админку.",
      "admin.loggedOut": "Вы вышли из админки.",
      "admin.logoutFailed": "Не удалось выйти.",
      "admin.uploading": "Загрузка...",
      "admin.chooseFile": "Сначала выберите файл.",
      "admin.uploadSuccess": "Файл успешно загружен.",
      "admin.uploadFailed": "Не удалось загрузить файл.",
      "admin.uploadFirst": "Сначала загрузите файл.",
      "admin.mediaAdded": "Медиа-блок добавлен из последней загрузки.",
      "admin.draftCleared": "Черновик очищен.",
      "admin.creatingPost": "Создание поста...",
      "admin.postTitleRequired": "Нужен заголовок поста.",
      "admin.needBlock": "Добавьте хотя бы один блок перед публикацией.",
      "admin.validatorMissing": "Валидатор блоков недоступен. Обновите страницу.",
      "admin.blockIncomplete": "Блок {index} заполнен не полностью. Заполните обязательные поля.",
      "admin.postCreated": "Пост успешно создан.",
      "admin.postCreateFailed": "Не удалось создать пост.",
      "admin.sessionExpired": "Сессия истекла. Войдите снова.",
      "admin.previewNeedBlocks": "Добавьте блоки для предпросмотра содержимого.",
      "admin.previewUnavailable": "Рендер предпросмотра недоступен.",
      "admin.previewIncomplete": "Блок {index} неполный и пока не показан.",
      "admin.previewCannot": "Блок {index} пока нельзя отобразить.",
      "admin.previewNoReadable": "Пока нет читаемых блоков.",
      "admin.blockTypeParagraph": "Абзац",
      "admin.blockTypeHeading": "Заголовок",
      "admin.blockTypeQuote": "Цитата",
      "admin.blockTypeDivider": "Разделитель",
      "admin.blockTypeMedia": "Медиа",
      "admin.blockTypeFallback": "Блок",
      "admin.block": "Блок {index}",
      "admin.moveUp": "Вверх",
      "admin.moveDown": "Вниз",
      "admin.delete": "Удалить",
      "admin.deletePost": "Удалить пост",
      "admin.deletePostAria": "Удалить пост {id}",
      "admin.deleteComment": "Удалить коммент",
      "admin.deleteCommentAria": "Удалить комментарий {id}",
      "admin.confirmDeletePost": "Удалить этот пост и все его комментарии?",
      "admin.confirmDeleteComment": "Удалить этот комментарий?",
      "admin.postDeleted": "Пост удален.",
      "admin.commentDeleted": "Комментарий удален.",
      "admin.deleteFailed": "Не удалось удалить.",
      "admin.fieldText": "Текст",
      "admin.fieldHeadingLevel": "Уровень заголовка",
      "admin.fieldQuoteText": "Текст цитаты",
      "admin.dividerNoFields": "У разделителя нет дополнительных полей.",
      "admin.fieldMediaKind": "Тип медиа",
      "admin.fieldSource": "URL источника",
      "admin.fieldName": "Имя",
      "admin.fieldAlt": "Alt-текст",
      "admin.fieldCaption": "Подпись",
      "admin.unsupportedBlock": "Неподдерживаемый тип блока.",
      "errors.postNotFound": "Пост не найден.",
      "errors.invalidPostId": "Некорректный id поста.",
      "errors.invalidCommentId": "Некорректный id комментария.",
      "errors.commentNotFound": "Комментарий не найден.",
      "errors.invalidParentCommentId": "Некорректный id родительского комментария.",
      "errors.parentCommentNotFound": "Родительский комментарий не найден.",
      "errors.rateLike": "Слишком много запросов на лайк. Попробуйте через минуту.",
      "errors.rateComment": "Слишком много комментариев с этого IP. Попробуйте через минуту.",
      "errors.likeCooldown": "Вы недавно уже лайкали этот пост. Подождите около {seconds} сек.",
      "errors.spam": "Обнаружен спам.",
      "errors.commentRequired": "Нужны поля post_id и content.",
      "errors.commentEmpty": "Комментарий не может быть пустым.",
      "errors.commentTooLong": "Комментарий слишком длинный. Максимум {max} символов.",
      "errors.commentTooRepetitive": "Комментарий выглядит слишком однообразным.",
      "errors.commentTooNoisy": "Пожалуйста, уменьшите повторы символов или эмодзи.",
      "errors.commentTooManyLinks": "В комментарии слишком много ссылок. Уменьшите их количество.",
      "errors.commentRateLimited": "Вы комментируете слишком быстро. Подождите немного.",
      "errors.commentAttemptsRate": "Слишком много попыток отправить комментарий. Подождите немного.",
      "errors.commentDuplicate": "Такой же комментарий уже недавно отправлялся. Подождите или измените текст.",
      "errors.commentNameTooLong": "Имя слишком длинное. Максимум {max} символов.",
      "errors.commentUnsupportedType": "Комментарии принимаются только в формате JSON.",
      "errors.commentBodyTooLarge": "Слишком большой запрос комментария. Сократите имя или текст.",
      "errors.invalidJsonBody": "Некорректный JSON в запросе.",
      "errors.invalidRequestPayload": "Некорректное тело запроса.",
      "errors.requestTooLarge": "Слишком большой запрос.",
      "errors.adminPostRateLimit": "Слишком много попыток создания постов. Подождите несколько минут.",
      "errors.adminRequired": "Требуется вход в админку.",
      "errors.adminSecretRequired": "Нужен админ-секрет.",
      "errors.adminSecretInvalid": "Неверный админ-секрет.",
      "errors.fileRequired": "Нужно поле file.",
      "errors.fileEmpty": "Пустые файлы загружать нельзя.",
      "errors.fileTooLarge": "Файл слишком большой. Максимум {size}.",
      "errors.invalidPayload": "Некорректные данные поста.",
      "errors.internal": "Внутренняя ошибка сервера."
    },
    en: {
      "brand.name": "StereoDamage",
      "title.feed": "StereoDamage - Feed",
      "title.post": "StereoDamage - Post",
      "title.postWithName": "StereoDamage - {title}",
      "title.admin": "StereoDamage - Admin",
      "nav.mainAria": "Main navigation",
      "nav.home": "Home",
      "nav.post": "Post",
      "nav.admin": "Admin",
      "nav.adminPanel": "Admin Panel",
      "nav.logout": "Logout",
      "lang.switcherAria": "Language switcher",
      "theme.label": "Theme: {theme}",
      "theme.light": "Light",
      "theme.dark": "Dark",
      "theme.switchTo": "Switch to {theme} theme",
      "common.requestFailed": "Request failed.",
      "common.anonymous": "Anonymous",
      "common.file": "file",
      "common.postMedia": "Post media",
      "audio.trackFallback": "Audio attachment",
      "audio.play": "Play",
      "audio.pause": "Pause",
      "audio.playAria": "Play audio",
      "audio.pauseAria": "Pause audio playback",
      "audio.seekAria": "Seek playback position",
      "audio.loadingMetadata": "Loading audio...",
      "audio.preparingWaveform": "Preparing waveform...",
      "audio.unavailable": "Audio unavailable.",
      "audio.waveformFallback": "Waveform unavailable. Showing progress bar.",
      "audio.playFailed": "Unable to start playback.",
      "audio.closePlayer": "Close player",
      "feed.title": "Posts",
      "feed.subtitle": "Reverse chronological timeline",
      "feed.loading": "Loading timeline...",
      "feed.loadError": "Failed to load timeline.",
      "feed.empty": "No posts yet.",
      "feed.summary": "{count} post(s), newest first.",
      "feed.untitled": "Untitled post",
      "feed.noPreview": "No paragraph preview.",
      "feed.mediaAttachment": "Attachment",
      "feed.mediaVideo": "Video attachment",
      "feed.mediaFile": "File attachment",
      "feed.noReplies": "No replies yet.",
      "feed.openFull": "Open full post and all comments",
      "feed.like": "Like",
      "feed.likeAria": "Like this post",
      "feed.likeCount": "{count} like(s)",
      "feed.sending": "Sending...",
      "feed.likeSuccess": "Thanks! Like saved.",
      "feed.likeTooFast": "Please wait before liking again.",
      "feed.likeMissing": "This post no longer exists.",
      "feed.likeError": "Failed to save like.",
      "post.loading": "Loading post...",
      "post.loadError": "Failed to load post.",
      "post.invalidId": "Invalid post id.",
      "post.back": "<- Back to feed",
      "post.comments": "Comments",
      "post.nameLabel": "Name (optional)",
      "post.namePlaceholder": "Anonymous visitor",
      "post.commentLabel": "Comment",
      "post.commentPlaceholder": "Leave a note...",
      "post.reply": "Reply",
      "post.cancelReply": "Cancel",
      "post.replyPlaceholder": "Write a reply...",
      "post.sendReply": "Send Reply",
      "post.websiteLabel": "Website",
      "post.send": "Send Comment",
      "post.commentSending": "Sending...",
      "post.commentPosted": "Comment posted.",
      "post.replyPosted": "Reply posted.",
      "post.replyRequired": "Reply content is required.",
      "post.commentError": "Failed to post comment.",
      "post.emptyBlocks": "This post has no readable blocks.",
      "post.fileAttached": "Attached file",
      "post.noComments": "No comments yet. Be the first visitor to write one.",
      "post.showMore": "Show more",
      "post.showLess": "Show less",
      "admin.title": "Admin",
      "admin.subtitle": "Login once, then upload files and create posts.",
      "admin.loginTitle": "Admin Login",
      "admin.secretLabel": "Admin secret",
      "admin.secretPlaceholder": "Enter ADMIN_SECRET",
      "admin.loginButton": "Login",
      "admin.sectionUpload": "1) Upload File",
      "admin.fileLabel": "File",
      "admin.uploadButton": "Upload",
      "admin.insertMedia": "Insert into new media block",
      "admin.sectionCreate": "2) Create Post",
      "admin.postTitleLabel": "Post title",
      "admin.postTitlePlaceholder": "Post title",
      "admin.addBlockAria": "Add block",
      "admin.addParagraph": "Add paragraph",
      "admin.addHeading": "Add heading",
      "admin.addQuote": "Add quote",
      "admin.addDivider": "Add divider",
      "admin.addMedia": "Add media",
      "admin.emptyBlocks": "No blocks yet. Add one to start composing.",
      "admin.rawJson": "Raw Blocks JSON (debug)",
      "admin.createPost": "Create Post",
      "admin.clearDraft": "Clear Draft",
      "admin.preview": "Live Preview",
      "admin.previewPlaceholder": "Add a title and blocks to preview the post.",
      "admin.exampleJson": "Example Blocks JSON",
      "admin.previewUntitled": "Untitled post",
      "admin.sessionNeedLogin": "Log in to access admin tools.",
      "admin.sessionActive": "Admin session active.",
      "admin.loggedInMessage": "Logged in. You can upload files and publish posts.",
      "admin.loginPrompt": "Log in with ADMIN_SECRET to access admin tools.",
      "admin.sessionCheckFailed": "Could not check admin session. Try again.",
      "admin.forceLogin": "Please log in as admin.",
      "admin.secretRequired": "Admin secret is required.",
      "admin.loggingIn": "Logging in...",
      "admin.loginFailed": "Login failed.",
      "admin.loginRequired": "Admin login required.",
      "admin.loggedOut": "Logged out.",
      "admin.logoutFailed": "Logout failed.",
      "admin.uploading": "Uploading...",
      "admin.chooseFile": "Choose a file first.",
      "admin.uploadSuccess": "Upload successful.",
      "admin.uploadFailed": "Upload failed.",
      "admin.uploadFirst": "Upload a file first.",
      "admin.mediaAdded": "Added new media block from latest upload.",
      "admin.draftCleared": "Draft cleared.",
      "admin.creatingPost": "Creating post...",
      "admin.postTitleRequired": "Post title is required.",
      "admin.needBlock": "Add at least one block before publishing.",
      "admin.validatorMissing": "Block validator unavailable. Reload the page and try again.",
      "admin.blockIncomplete": "Block {index} is incomplete. Fill required fields before publishing.",
      "admin.postCreated": "Post created successfully.",
      "admin.postCreateFailed": "Post creation failed.",
      "admin.sessionExpired": "Session expired. Log in again to continue.",
      "admin.previewNeedBlocks": "Add blocks to preview post content.",
      "admin.previewUnavailable": "Preview renderer unavailable.",
      "admin.previewIncomplete": "Block {index} is incomplete and not shown yet.",
      "admin.previewCannot": "Block {index} cannot be previewed yet.",
      "admin.previewNoReadable": "No readable blocks yet.",
      "admin.blockTypeParagraph": "Paragraph",
      "admin.blockTypeHeading": "Heading",
      "admin.blockTypeQuote": "Quote",
      "admin.blockTypeDivider": "Divider",
      "admin.blockTypeMedia": "Media",
      "admin.blockTypeFallback": "Block",
      "admin.block": "Block {index}",
      "admin.moveUp": "Move Up",
      "admin.moveDown": "Move Down",
      "admin.delete": "Delete",
      "admin.deletePost": "Delete post",
      "admin.deletePostAria": "Delete post {id}",
      "admin.deleteComment": "Delete comment",
      "admin.deleteCommentAria": "Delete comment {id}",
      "admin.confirmDeletePost": "Delete this post and all its comments?",
      "admin.confirmDeleteComment": "Delete this comment?",
      "admin.postDeleted": "Post deleted.",
      "admin.commentDeleted": "Comment deleted.",
      "admin.deleteFailed": "Delete failed.",
      "admin.fieldText": "Text",
      "admin.fieldHeadingLevel": "Heading level",
      "admin.fieldQuoteText": "Quote text",
      "admin.dividerNoFields": "Divider has no extra fields.",
      "admin.fieldMediaKind": "Media kind",
      "admin.fieldSource": "Source URL",
      "admin.fieldName": "Name",
      "admin.fieldAlt": "Alt text",
      "admin.fieldCaption": "Caption",
      "admin.unsupportedBlock": "Unsupported block type.",
      "errors.postNotFound": "Post not found.",
      "errors.invalidPostId": "Invalid post id.",
      "errors.invalidCommentId": "Invalid comment id.",
      "errors.commentNotFound": "Comment not found.",
      "errors.invalidParentCommentId": "Invalid parent comment id.",
      "errors.parentCommentNotFound": "Parent comment not found.",
      "errors.rateLike": "Too many like requests from this IP. Please wait a minute and try again.",
      "errors.rateComment": "Too many comments from this IP. Please try again in a minute.",
      "errors.likeCooldown": "You already liked this post recently. Please wait about {seconds} seconds.",
      "errors.spam": "Spam detected.",
      "errors.commentRequired": "post_id and content are required.",
      "errors.commentEmpty": "Comment cannot be empty.",
      "errors.commentTooLong": "Comment is too long. Maximum is {max} characters.",
      "errors.commentTooRepetitive": "Comment is too repetitive.",
      "errors.commentTooNoisy": "Please reduce repeated symbols or emoji.",
      "errors.commentTooManyLinks": "Comment has too many links. Please reduce links in your message.",
      "errors.commentRateLimited": "You are commenting too quickly. Please wait a moment.",
      "errors.commentAttemptsRate": "Too many comment attempts from this IP. Please slow down and try again.",
      "errors.commentDuplicate": "You posted the same comment very recently. Please wait or edit it.",
      "errors.commentNameTooLong": "Comment name is too long. Maximum is {max} characters.",
      "errors.commentUnsupportedType": "Comments accept JSON requests only.",
      "errors.commentBodyTooLarge": "Comment request is too large. Please shorten your name or comment.",
      "errors.invalidJsonBody": "Invalid JSON body.",
      "errors.invalidRequestPayload": "Invalid request payload.",
      "errors.requestTooLarge": "Request is too large.",
      "errors.adminPostRateLimit": "Too many post creation attempts. Please wait a few minutes and try again.",
      "errors.adminRequired": "Admin login required.",
      "errors.adminSecretRequired": "Admin secret is required.",
      "errors.adminSecretInvalid": "Invalid admin secret.",
      "errors.fileRequired": "file is required.",
      "errors.fileEmpty": "Empty file uploads are not allowed.",
      "errors.fileTooLarge": "File is too large. Max size is {size}.",
      "errors.invalidPayload": "Invalid post payload.",
      "errors.internal": "Internal server error."
    }
  };

  function normalizeLanguage(value) {
    const lang = String(value || "").toLowerCase();
    if (SUPPORTED_LANGUAGES.has(lang)) {
      return lang;
    }
    return DEFAULT_LANGUAGE;
  }

  function readLanguage() {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return DEFAULT_LANGUAGE;
    }
  }

  function saveLanguage(language) {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (error) {
      return;
    }
  }

  let currentLanguage = readLanguage();

  function interpolate(template, params) {
    if (typeof template !== "string") {
      return "";
    }

    if (!params || typeof params !== "object") {
      return template;
    }

    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (fullMatch, key) => {
      if (!Object.prototype.hasOwnProperty.call(params, key)) {
        return fullMatch;
      }
      return String(params[key]);
    });
  }

  function t(key, params) {
    const dictionary = TRANSLATIONS[currentLanguage] || TRANSLATIONS[DEFAULT_LANGUAGE];
    const fallbackDictionary = TRANSLATIONS.en || {};
    const template =
      (dictionary && dictionary[key]) || (fallbackDictionary && fallbackDictionary[key]) || String(key || "");
    return interpolate(template, params);
  }

  function updateLanguageOptions() {
    const controls = Array.from(document.querySelectorAll("[data-language-option]"));
    controls.forEach((control) => {
      const optionLanguage = normalizeLanguage(control.dataset.languageOption);
      const active = optionLanguage === currentLanguage;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
    });
  }

  function applyDataI18n() {
    const textNodes = Array.from(document.querySelectorAll("[data-i18n]"));
    textNodes.forEach((element) => {
      const key = element.dataset.i18n;
      if (!key) return;
      element.textContent = t(key);
    });

    const placeholders = Array.from(document.querySelectorAll("[data-i18n-placeholder]"));
    placeholders.forEach((element) => {
      const key = element.dataset.i18nPlaceholder;
      if (!key) return;
      element.setAttribute("placeholder", t(key));
    });

    const ariaLabels = Array.from(document.querySelectorAll("[data-i18n-aria-label]"));
    ariaLabels.forEach((element) => {
      const key = element.dataset.i18nAriaLabel;
      if (!key) return;
      element.setAttribute("aria-label", t(key));
    });

    document.documentElement.lang = currentLanguage;
  }

  function translateError(rawMessage) {
    const message = String(rawMessage || "").trim();
    if (!message) {
      return "";
    }

    if (currentLanguage === "en") {
      return message;
    }

    if (message === "Post not found.") return t("errors.postNotFound");
    if (message === "Invalid post id.") return t("errors.invalidPostId");
    if (message === "Invalid comment id.") return t("errors.invalidCommentId");
    if (message === "Comment not found.") return t("errors.commentNotFound");
    if (message === "Invalid parent comment id.") return t("errors.invalidParentCommentId");
    if (message === "Parent comment not found.") return t("errors.parentCommentNotFound");
    if (message === "Too many like requests from this IP. Please wait a minute and try again.") {
      return t("errors.rateLike");
    }
    if (message === "Too many comments from this IP. Please try again in a minute.") {
      return t("errors.rateComment");
    }
    if (message === "Spam detected.") return t("errors.spam");
    if (message === "post_id and content are required.") return t("errors.commentRequired");
    if (message === "Comment cannot be empty.") return t("errors.commentEmpty");
    if (message === "Comment is too repetitive.") return t("errors.commentTooRepetitive");
    if (message === "Please reduce repeated symbols or emoji.") return t("errors.commentTooNoisy");
    if (message === "Comment has too many links. Please reduce links in your message.") {
      return t("errors.commentTooManyLinks");
    }
    if (message === "You are commenting too quickly. Please wait a moment.") {
      return t("errors.commentRateLimited");
    }
    if (message === "Too many comment attempts from this IP. Please slow down and try again.") {
      return t("errors.commentAttemptsRate");
    }
    if (message === "You posted the same comment very recently. Please wait or edit it.") {
      return t("errors.commentDuplicate");
    }
    if (message === "Unsupported content type. Please send JSON.") {
      return t("errors.commentUnsupportedType");
    }
    if (message === "Comment request is too large. Please shorten your name or comment.") {
      return t("errors.commentBodyTooLarge");
    }
    if (message === "Invalid JSON body.") return t("errors.invalidJsonBody");
    if (message === "Invalid request payload.") return t("errors.invalidRequestPayload");
    if (message === "Request is too large.") return t("errors.requestTooLarge");
    if (message === "Too many post creation attempts. Please wait a few minutes and try again.") {
      return t("errors.adminPostRateLimit");
    }
    if (message === "Admin login required.") return t("errors.adminRequired");
    if (message === "Admin secret is required.") return t("errors.adminSecretRequired");
    if (message === "Invalid admin secret.") return t("errors.adminSecretInvalid");
    if (message === "file is required.") return t("errors.fileRequired");
    if (message === "Empty file uploads are not allowed.") return t("errors.fileEmpty");
    if (message === "Invalid post payload.") return t("errors.invalidPayload");
    if (message === "Internal server error.") return t("errors.internal");

    if (message.startsWith("File is too large. Max size is ")) {
      const size = message.replace("File is too large. Max size is ", "").replace(/\.$/, "");
      return t("errors.fileTooLarge", { size });
    }

    if (message.startsWith("Comment is too long. Maximum is ")) {
      const max = message.replace("Comment is too long. Maximum is ", "").replace(/ characters\.$/, "");
      return t("errors.commentTooLong", { max });
    }

    if (message.startsWith("Comment name is too long. Maximum is ")) {
      const max = message
        .replace("Comment name is too long. Maximum is ", "")
        .replace(/ characters\.$/, "");
      return t("errors.commentNameTooLong", { max });
    }

    if (message.startsWith("Invalid post payload.")) {
      const details = message.replace("Invalid post payload.", "").trim();
      const translated = t("errors.invalidPayload");
      return details ? translated + " " + details : translated;
    }

    if (message.startsWith("You already liked this post recently. Please wait about ")) {
      const matched = message.match(/(\d+)/);
      const seconds = matched ? matched[1] : "?";
      return t("errors.likeCooldown", { seconds });
    }

    return message;
  }

  function setLanguage(language, reloadPage) {
    const normalized = normalizeLanguage(language);
    const changed = normalized !== currentLanguage;
    currentLanguage = normalized;
    saveLanguage(normalized);
    applyDataI18n();
    updateLanguageOptions();

    if (changed) {
      window.dispatchEvent(
        new CustomEvent("languagechange", {
          detail: {
            language: currentLanguage
          }
        })
      );
    }

    if (changed && reloadPage) {
      window.location.reload();
    }
  }

  function attachLanguageControls() {
    const controls = Array.from(document.querySelectorAll("[data-language-option]"));
    controls.forEach((control) => {
      control.addEventListener("click", () => {
        const language = normalizeLanguage(control.dataset.languageOption);
        setLanguage(language, true);
      });
    });
  }

  window.i18n = {
    t,
    getLanguage: () => currentLanguage,
    setLanguage: (language) => setLanguage(language, false),
    applyStatic: applyDataI18n,
    translateError
  };

  attachLanguageControls();
  setLanguage(currentLanguage, false);
})();
