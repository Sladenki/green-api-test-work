import type {
  Auth,
  InstanceSettings,
  InstanceState,
  Notification,
  NotificationBody,
  SentMessage,
  WhatsappAccount,
} from './types'
import { isRecord } from './types'

// Хост без дефиса: с этой сети api.green-api.com не открывается.
export const DEFAULT_API_URL = 'https://api.greenapi.com'
export const MESSAGE_LIMIT = 20000

export function normalizeApiUrl(url?: string) {
  const value = String(url || DEFAULT_API_URL).trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('API URL должен начинаться с http:// или https://')
  }
  return value
}

function endpoint(auth: Auth, method: string, suffix = '') {
  const apiUrl = normalizeApiUrl(auth.apiUrl)
  const idInstance = encodeURIComponent(auth.idInstance.trim())
  const apiTokenInstance = encodeURIComponent(auth.apiTokenInstance.trim())
  return `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}`
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function errorMessage(data: unknown, response: Response) {
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (isRecord(data)) {
    const message = data.message || data.error || data.description
    if (typeof message === 'string' && message.trim()) return message
  }
  return `Ошибка ${response.status}`
}

async function request(url: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
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

export async function getStateInstance(auth: Auth, signal?: AbortSignal): Promise<InstanceState> {
  const data = await request(endpoint(auth, 'getStateInstance'), { method: 'GET', signal })
  if (!isRecord(data) || typeof data.stateInstance !== 'string') return {}
  return { stateInstance: data.stateInstance }
}

export async function getSettings(auth: Auth, signal?: AbortSignal): Promise<InstanceSettings> {
  const data = await request(endpoint(auth, 'getSettings'), { method: 'GET', signal })
  if (!isRecord(data)) return {}
  return {
    webhookUrl: typeof data.webhookUrl === 'string' ? data.webhookUrl : '',
    incomingWebhook: typeof data.incomingWebhook === 'string' ? data.incomingWebhook : 'no',
  }
}

export function setSettings(auth: Auth, settings: InstanceSettings, signal?: AbortSignal) {
  return request(endpoint(auth, 'setSettings'), {
    method: 'POST',
    body: JSON.stringify(settings),
    signal,
  })
}

// У нового инстанса входящие выключены. Включаем их один раз, иначе ответы не приходят.
export async function ensureIncomingNotifications(auth: Auth, signal?: AbortSignal) {
  const settings = await getSettings(auth, signal)
  const webhookUrl = settings.webhookUrl?.trim() ?? ''
  const incomingOn = settings.incomingWebhook === 'yes'
  if (!webhookUrl && incomingOn) return { changed: false }

  await setSettings(auth, { webhookUrl: '', incomingWebhook: 'yes' }, signal)
  return { changed: true }
}

export async function checkWhatsapp(
  auth: Auth,
  phoneDigits: string,
  signal?: AbortSignal,
): Promise<WhatsappAccount> {
  const data = await request(endpoint(auth, 'checkWhatsapp'), {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: Number(phoneDigits) }),
    signal,
  })
  if (!isRecord(data)) return {}
  return {
    existsWhatsapp: data.existsWhatsapp === true,
    chatId: data.chatId != null ? String(data.chatId) : undefined,
    username: typeof data.username === 'string' ? data.username : undefined,
    phoneNumber:
      typeof data.phoneNumber === 'string' || typeof data.phoneNumber === 'number'
        ? data.phoneNumber
        : undefined,
  }
}

export async function sendMessage(
  auth: Auth,
  chatId: string,
  message: string,
  signal?: AbortSignal,
): Promise<SentMessage> {
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

  if (!isRecord(data) || data.idMessage == null || data.idMessage === '') {
    throw new Error('GREEN-API не вернул идентификатор сообщения')
  }

  return { idMessage: String(data.idMessage) }
}

export async function receiveNotification(
  auth: Auth,
  receiveTimeout: number,
  signal?: AbortSignal,
): Promise<Notification | null> {
  const timeout = Math.min(60, Math.max(5, receiveTimeout))
  const data = await request(
    endpoint(auth, 'receiveNotification', `?receiveTimeout=${timeout}`),
    { method: 'GET', signal },
  )
  if (!isRecord(data) || data.receiptId == null) return null

  return {
    receiptId: Number(data.receiptId),
    body: isRecord(data.body) ? (data.body as NotificationBody) : undefined,
  }
}

export function deleteNotification(auth: Auth, receiptId: number, signal?: AbortSignal) {
  return request(endpoint(auth, 'deleteNotification', `/${receiptId}`), {
    method: 'DELETE',
    signal,
  })
}

export const STATE_LABELS: Record<string, string> = {
  authorized: 'WhatsApp подключен',
  notAuthorized: 'Инстанс не авторизован',
  starting: 'Инстанс запускается',
  blocked: 'Инстанс заблокирован',
  suspended: 'На аккаунте временные ограничения',
  pendingPassword: 'Нужен пароль двухфакторной защиты',
  sleepMode: 'Спящий режим',
  yellowCard: 'На аккаунте есть ограничения',
}
