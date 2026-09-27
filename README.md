# Чат WhatsApp через GREEN-API

Веб-чат на React и TypeScript для отправки и получения текстовых сообщений в WhatsApp. Интерфейс сделан по образцу [web.max.ru](https://web.max.ru/): список диалогов слева, переписка справа, синие исходящие сообщения.

## Локальный запуск

Нужны Node.js 20+ и npm.

```bash
git clone 
npm install
npm run dev
```

Сайт откроется на [http://localhost:5173](http://localhost:5173).

## Подготовка GREEN-API

1. Зарегистрируйтесь в [личном кабинете GREEN-API](https://console.greenapi.com/auth).
2. Создайте инстанс **WhatsApp** и авторизуйте его QR-кодом: в телефоне откройте WhatsApp → Настройки → Связанные устройства → Привязка устройства.
3. Скопируйте `apiUrl`, `idInstance` и `apiTokenInstance`. Если в кабинете указан другой `apiUrl`, вставьте его: общий адрес по умолчанию — `https://api.greenapi.com`. При входе приложение само включает входящие уведомления и очищает `webhookUrl`. Инстанс после этого может перезапуститься на несколько минут.

## Как пользоваться

1. Откройте сайт и введите данные инстанса. Кнопка «Войти» проверяет их методом `getStateInstance`.
2. Введите номер телефона получателя в международном формате, например `79991234567`, и нажмите «Создать». Номер `8 999…` будет приведён к `7 999…`.
3. Приложение проверит, что номер есть в WhatsApp (`checkWhatsapp`), и откроет чат.
4. Напишите текст и отправьте его. Enter отправляет сообщение, Shift+Enter переносит строку.
5. Ответ из WhatsApp появится в этом чате. Приложение забирает уведомления методом `receiveNotification` и удаляет их методом `deleteNotification`.

Учётные данные и переписка хранятся только в `localStorage` браузера. 

## Что реализовано

- Вход по `idInstance`, `apiTokenInstance` и `apiUrl`.
- Новый чат по номеру телефона.
- Отправка текста: [SendMessage](https://green-api.com/en/docs/api/sending/SendMessage/).
- Получение текста: [HTTP API](https://green-api.com/en/docs/api/receiving/technology-http-api/ReceiveNotification/).
- Только текстовые сообщения. Файлы, статусы и служебные уведомления не показываются.

`chatId` для отправки берётся из [checkWhatsapp](https://green-api.com/en/docs/api/service/CheckWhatsapp/). Если метод не вернул идентификатор, используется номер в формате `телефон@c.us`.
