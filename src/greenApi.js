export const DEFAULT_API_URL = 'https://api.greenapi.com'
export const MESSAGE_LIMIT = 20000

export function normalizeApiUrl(url) {
  const value = String(url || DEFAULT_API_URL).trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('API URL должен начинаться с http:// или https://')
  }
  return value
}

function endpoint(auth, method, suffix = '') {
  const apiUrl = normalizeApiUrl(auth.apiUrl)
  const idInstance = encodeURIComponent(String(auth.idInstance).trim())
  const apiTokenInstance = encodeURIComponent(String(auth.apiTokenInstance).trim())
  return `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}`
}

async function readBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(data, response) {
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (data && typeof data === 'object') {
    return data.message || data.error || data.description || `Ошибка ${response.status}`
  }
  return `Ошибка ${response.status}`
}

async function request(url, options = {}) {
  let response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error('Нет соединения с GREEN-API. Проверьте API URL и доступ в интернет.', {
      cause: error,
    })
  }

  const data = await readBody(response)
  if (!response.ok) {
    throw new Error(errorMessage(data, response))
  }
  return data
}

export function getStateInstance(auth, signal) {
  return request(endpoint(auth, 'getStateInstance'), { method: 'GET', signal })
}

export function getSettings(auth, signal) {
  return request(endpoint(auth, 'getSettings'), { method: 'GET', signal })
}

export function setSettings(auth, settings, signal) {
  return request(endpoint(auth, 'setSettings'), {
    method: 'POST',
    body: JSON.stringify(settings),
    signal,
  })
}

export async function ensureIncomingNotifications(auth, signal) {
  const settings = await getSettings(auth, signal)
  const webhookUrl = typeof settings?.webhookUrl === 'string' ? settings.webhookUrl.trim() : ''
  const incomingOn = settings?.incomingWebhook === 'yes'
  if (!webhookUrl && incomingOn) return { changed: false }

  await setSettings(auth, { webhookUrl: '', incomingWebhook: 'yes' }, signal)
  return { changed: true }
}

export function checkWhatsapp(auth, phoneDigits, signal) {
  return request(endpoint(auth, 'checkWhatsapp'), {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: Number(phoneDigits) }),
    signal,
  })
}

export async function sendMessage(auth, chatId, message, signal) {
  const text = message.trim()
  if (!text) throw new Error('Введите текст сообщения')
  if (text.length > MESSAGE_LIMIT) {
    throw new Error(`Сообщение длиннее ${MESSAGE_LIMIT} символов`)
  }

  const data = await request(endpoint(auth, 'sendMessage'), {
    method: 'POST',
    body: JSON.stringify({ chatId, message: text }),
    signal,
  })

  if (!data?.idMessage) {
    throw new Error('GREEN-API не вернул идентификатор сообщения')
  }

  return data
}

export function receiveNotification(auth, receiveTimeout, signal) {
  const timeout = Math.min(60, Math.max(5, receiveTimeout))
  return request(endpoint(auth, 'receiveNotification', `?receiveTimeout=${timeout}`), {
    method: 'GET',
    signal,
  })
}

export function deleteNotification(auth, receiptId, signal) {
  return request(endpoint(auth, 'deleteNotification', `/${receiptId}`), {
    method: 'DELETE',
    signal,
  })
}

export const STATE_LABELS = {
  authorized: 'WhatsApp подключен',
  notAuthorized: 'Инстанс не авторизован',
  starting: 'Инстанс запускается',
  blocked: 'Инстанс заблокирован',
  suspended: 'На аккаунте временные ограничения',
  pendingPassword: 'Нужен пароль двухфакторной защиты',
  sleepMode: 'Спящий режим',
  yellowCard: 'На аккаунте есть ограничения',
}
