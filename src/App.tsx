import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  appendOutgoing,
  applyNotification,
  chatFromAccount,
  confirmOutgoing,
  failOutgoing,
  formatPhone,
  markChatRead,
  normalizePhone,
} from './chatModel'
import {
  DEFAULT_API_URL,
  MESSAGE_LIMIT,
  STATE_LABELS,
  checkWhatsapp,
  deleteNotification,
  ensureIncomingNotifications,
  getStateInstance,
  receiveNotification,
  sendMessage,
} from './greenApi'
import type { Auth, Chat, ChatMessage, MessageStatus, Session } from './types'
import { isRecord } from './types'
import './App.css'

// Данные инстанса и переписка остаются только в этом браузере.
const AUTH_KEY = 'wa-chat-auth'

const AVATAR_COLORS = ['#2f80ed', '#1f9d8a', '#6d5efc', '#e07a3d', '#d4527a', '#3d8b8b']

function chatsKey(idInstance: string) {
  return `wa-chat-chats:${idInstance}`
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    typeof value.outgoing === 'boolean' &&
    typeof value.timestamp === 'number' &&
    (value.status === 'sending' || value.status === 'sent' || value.status === 'error')
  )
}

function isChat(value: unknown): value is Chat {
  if (!isRecord(value) || !Array.isArray(value.messages)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.phone === 'string' &&
    typeof value.title === 'string' &&
    typeof value.unread === 'number' &&
    value.messages.every(isMessage)
  )
}

function readAuth(): Auth | null {
  const data = readJson(AUTH_KEY)
  if (!isRecord(data)) return null
  if (typeof data.idInstance !== 'string' || typeof data.apiTokenInstance !== 'string') return null
  const idInstance = data.idInstance.trim()
  const apiTokenInstance = data.apiTokenInstance.trim()
  if (!idInstance || !apiTokenInstance) return null
  const apiUrl = typeof data.apiUrl === 'string' ? data.apiUrl.trim() : ''
  return {
    idInstance,
    apiTokenInstance,
    apiUrl: apiUrl || DEFAULT_API_URL,
  }
}

function readChats(idInstance: string) {
  const chats = readJson(chatsKey(idInstance))
  return Array.isArray(chats) ? chats.filter(isChat) : []
}

function saveAuth(auth: Auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

function colorFrom(value: string) {
  const index = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDay(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Сегодня'
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function sameDay(left: number, right: number) {
  return new Date(left).toDateString() === new Date(right).toDateString()
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function Avatar({ title, size = 44 }: { title: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: colorFrom(title), width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {(title || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

// Форма входа: idInstance, ключ и адрес API из личного кабинета.
function AuthScreen({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL)
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const auth: Auth = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
      apiUrl: apiUrl.trim() || DEFAULT_API_URL,
    }

    if (!/^\d+$/.test(auth.idInstance)) {
      setError('idInstance должен состоять только из цифр')
      return
    }
    if (auth.apiTokenInstance.length < 8) {
      setError('Введите apiTokenInstance из личного кабинета')
      return
    }

    setLoading(true)
    setError('')
    try {
      const state = await getStateInstance(auth)
      onSuccess({ ...auth, stateInstance: state.stateInstance || '' })
    } catch (requestError) {
      setError(errorText(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="22" height="22">
              <path
                fill="currentColor"
                d="M7 8.5A4.5 4.5 0 0 1 11.5 4h9A4.5 4.5 0 0 1 25 8.5v8a4.5 4.5 0 0 1-4.5 4.5H15l-5.2 4.2A1 1 0 0 1 8 24.4V21a4.5 4.5 0 0 1-1-2.9v-9.6Z"
              />
            </svg>
          </span>
          <div>
            <h1>Чаты</h1>
            <p>Текстовые сообщения WhatsApp через GREEN-API</p>
          </div>
        </div>

        <label>
          idInstance
          <input
            value={idInstance}
            onChange={(event) => setIdInstance(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="110100001"
            required
          />
        </label>

        <label>
          apiTokenInstance
          <span className="token-field">
            <input
              value={apiTokenInstance}
              onChange={(event) => setApiTokenInstance(event.target.value)}
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              placeholder="Ключ доступа инстанса"
              required
            />
            <button
              type="button"
              className="text-button"
              onClick={() => setShowToken((value) => !value)}
            >
              {showToken ? 'Скрыть' : 'Показать'}
            </button>
          </span>
        </label>

        <label>
          apiUrl
          <input
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            autoComplete="off"
            placeholder={DEFAULT_API_URL}
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </main>
  )
}

function ChatApp({ auth, onLogout }: { auth: Session; onLogout: () => void }) {
  const [chats, setChats] = useState<Chat[]>(() => readChats(auth.idInstance))
  const [activeChatId, setActiveChatId] = useState('')
  const [phone, setPhone] = useState('')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [pollError, setPollError] = useState('')
  const [stateInstance, setStateInstance] = useState(auth.stateInstance || '')
  const [mobileChat, setMobileChat] = useState(false)
  const activeIdRef = useRef(activeChatId)
  const threadRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const activeChat = chats.find((chat) => chat.id === activeChatId) || null

  useEffect(() => {
    activeIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    localStorage.setItem(chatsKey(auth.idInstance), JSON.stringify(chats))
  }, [auth.idInstance, chats])

  useEffect(() => {
    const node = threadRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [activeChat?.messages, activeChatId])

  useEffect(() => {
    const node = draftRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 140)}px`
  }, [draft, activeChatId])

  // Длинный опрос: забираем одно уведомление и сразу удаляем его из очереди.
  useEffect(() => {
    const controller = new AbortController()
    let stopped = false

    getStateInstance(auth, controller.signal)
      .then((state) => {
        if (!stopped) setStateInstance(state.stateInstance || '')
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || stopped) return
        setPollError(explainReceiveError(errorText(error)))
      })

    async function poll() {
      try {
        const receiving = await ensureIncomingNotifications(auth, controller.signal)
        if (!stopped && receiving.changed) {
          setPollError(
            'Приём ответов включён. Инстанс перезапускается несколько минут. Когда внизу будет «WhatsApp подключен», попросите друга написать ещё раз.',
          )
        }
      } catch (error) {
        if (isAbortError(error) || stopped) return
        if (!stopped) setPollError(explainReceiveError(errorText(error)))
      }

      while (!stopped) {
        try {
          const notification = await receiveNotification(auth, 20, controller.signal)
          if (stopped) return

          if (!notification?.receiptId) {
            await sleep(500, controller.signal)
            continue
          }

          if (!stopped) {
            setChats((current) =>
              applyNotification(current, notification.body, activeIdRef.current),
            )
          }

          await deleteNotification(auth, notification.receiptId, controller.signal)
          if (!stopped) setPollError('')
        } catch (error) {
          if (isAbortError(error) || stopped) return
          if (!stopped) setPollError(explainReceiveError(errorText(error)))
          try {
            await sleep(3000, controller.signal)
          } catch {
            return
          }
        }
      }
    }

    poll()
    return () => {
      stopped = true
      controller.abort()
    }
  }, [auth])

  function openChat(chatId: string) {
    activeIdRef.current = chatId
    setActiveChatId(chatId)
    setChats((current) => markChatRead(current, chatId))
    setMobileChat(true)
    setDraft('')
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const digits = normalizePhone(phone)
    if (!digits) {
      setFormError('Введите номер в международном формате, например 79991234567')
      return
    }

    const existing = chats.find((chat) => normalizePhone(chat.phone) === digits)
    if (existing) {
      openChat(existing.id)
      setPhone('')
      setFormError('')
      return
    }

    setCreating(true)
    setFormError('')
    try {
      const account = await checkWhatsapp(auth, digits)
      if (!account.existsWhatsapp) {
        setFormError('На этом номере нет WhatsApp')
        return
      }
      const chat = chatFromAccount(digits, account)
      setChats((current) =>
        current.some((item) => item.id === chat.id) ? current : [chat, ...current],
      )
      openChat(chat.id)
      setPhone('')
    } catch (error) {
      setFormError(errorText(error))
    } finally {
      setCreating(false)
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeChat || sending) return

    const text = draft.trim()
    if (!text) return
    if (text.length > MESSAGE_LIMIT) {
      setPollError(`Сообщение длиннее ${MESSAGE_LIMIT} символов`)
      return
    }

    const tempId = crypto.randomUUID()
    const chatId = activeChat.id
    setDraft('')
    setSending(true)
    setChats((current) =>
      appendOutgoing(current, chatId, {
        id: tempId,
        text,
        outgoing: true,
        timestamp: Date.now(),
        status: 'sending',
      }),
    )

    try {
      const result = await sendMessage(auth, chatId, text)
      setChats((current) => confirmOutgoing(current, chatId, tempId, result.idMessage))
    } catch (error) {
      setChats((current) => failOutgoing(current, chatId, tempId))
      setPollError(errorText(error))
    } finally {
      setSending(false)
    }
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const visibleChats = chats.filter((chat) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [chat.title, chat.phone, formatPhone(chat.phone)].some((value) =>
      String(value || '').toLowerCase().includes(needle),
    )
  })

  const stateLabel = STATE_LABELS[stateInstance] || stateInstance || 'Проверяем инстанс'

  return (
    <div className={mobileChat ? 'shell show-chat' : 'shell'}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand compact">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="18" height="18">
                <path
                  fill="currentColor"
                  d="M7 8.5A4.5 4.5 0 0 1 11.5 4h9A4.5 4.5 0 0 1 25 8.5v8a4.5 4.5 0 0 1-4.5 4.5H15l-5.2 4.2A1 1 0 0 1 8 24.4V21a4.5 4.5 0 0 1-1-2.9v-9.6Z"
                />
              </svg>
            </span>
            <strong>Чаты</strong>
          </div>
          <button type="button" className="text-button" onClick={onLogout}>
            Выйти
          </button>
        </header>

        <form className="new-chat" onSubmit={handleCreate}>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="79991234567"
            aria-label="Номер телефона получателя"
          />
          <button className="primary" type="submit" disabled={creating}>
            {creating ? '…' : 'Создать'}
          </button>
        </form>
        {formError ? <p className="form-error inset">{formError}</p> : null}

        <label className="search">
          <span className="sr-only">Поиск чатов</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
          />
        </label>

        <div className="chat-list">
          {visibleChats.length === 0 ? (
            <p className="empty-list">Создайте чат по номеру телефона</p>
          ) : (
            visibleChats.map((chat) => {
              const last = chat.messages[chat.messages.length - 1]
              return (
                <button
                  key={chat.id}
                  type="button"
                  className={chat.id === activeChatId ? 'chat-row active' : 'chat-row'}
                  onClick={() => openChat(chat.id)}
                >
                  <Avatar title={chat.title} />
                  <span className="chat-row-body">
                    <span className="chat-row-top">
                      <span className="chat-title">{chat.title}</span>
                      {last ? <time>{formatTime(last.timestamp)}</time> : null}
                    </span>
                    <span className="chat-row-bottom">
                      <span className="preview">
                        {last ? `${last.outgoing ? 'Вы: ' : ''}${last.text}` : 'Нет сообщений'}
                      </span>
                      {chat.unread > 0 ? <span className="badge">{chat.unread}</span> : null}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <footer className={stateInstance === 'authorized' ? 'status ok' : 'status'}>
          <span className="status-dot" />
          {stateLabel}
        </footer>
      </aside>

      <section className="conversation">
        {activeChat ? (
          <>
            <header className="conversation-header">
              <button
                type="button"
                className="back-button"
                onClick={() => setMobileChat(false)}
              >
                Назад
              </button>
              <Avatar title={activeChat.title} size={42} />
              <div>
                <h2>{activeChat.title}</h2>
                <p>{formatPhone(activeChat.phone) || 'Личный чат'}</p>
              </div>
            </header>

            {pollError ? (
              <div className="banner" role="status">
                <span>{pollError}</span>
                <button type="button" onClick={() => setPollError('')}>
                  Закрыть
                </button>
              </div>
            ) : null}

            <div className="thread" ref={threadRef}>
              {activeChat.messages.length === 0 ? (
                <p className="thread-empty">Напишите первое сообщение</p>
              ) : (
                activeChat.messages.map((message, index) => {
                  const previous = activeChat.messages[index - 1]
                  const showDay = !previous || !sameDay(previous.timestamp, message.timestamp)
                  return (
                    <div key={message.id}>
                      {showDay ? <div className="day">{formatDay(message.timestamp)}</div> : null}
                      <div className={message.outgoing ? 'message-row out' : 'message-row in'}>
                        <div className={`bubble ${message.status}`}>
                          <p>{message.text}</p>
                          <span className="meta">
                            <time>{formatTime(message.timestamp)}</time>
                            {message.outgoing ? <StatusMark status={message.status} /> : null}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form className="composer" onSubmit={handleSend}>
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder="Сообщение"
                rows={1}
                maxLength={MESSAGE_LIMIT}
                aria-label="Текст сообщения"
              />
              <button className="send" type="submit" disabled={sending || !draft.trim()}>
                <span className="sr-only">Отправить</span>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="currentColor" d="M3 20.5 21.5 12 3 3.5V10l12 2-12 2v6.5Z" />
                </svg>
              </button>
            </form>
          </>
        ) : (
          <div className="placeholder">
            <span className="brand-mark large" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="28" height="28">
                <path
                  fill="currentColor"
                  d="M7 8.5A4.5 4.5 0 0 1 11.5 4h9A4.5 4.5 0 0 1 25 8.5v8a4.5 4.5 0 0 1-4.5 4.5H15l-5.2 4.2A1 1 0 0 1 8 24.4V21a4.5 4.5 0 0 1-1-2.9v-9.6Z"
                />
              </svg>
            </span>
            <h2>Выберите чат</h2>
            <p>Введите номер телефона слева и создайте новый диалог.</p>
            {pollError ? <p className="form-error">{pollError}</p> : null}
          </div>
        )}
      </section>
    </div>
  )
}

function explainReceiveError(message: string) {
  if (/starting or not authorized/i.test(message)) {
    return 'Инстанс ещё запускается. Подождите, пока внизу появится «WhatsApp подключен», и попросите друга написать ещё раз.'
  }
  if (/webhook url is set/i.test(message)) {
    return 'В кабинете указан webhook, поэтому ответ не попадает в чат. Очистите webhook и включите входящие уведомления.'
  }
  return message || 'Не удалось получить сообщения'
}

function StatusMark({ status }: { status: MessageStatus }) {
  if (status === 'sending') return <span>…</span>
  if (status === 'error') return <span>не отправлено</span>
  return <span>✓</span>
}

export default function App() {
  const [auth, setAuth] = useState<Session | null>(readAuth)

  function handleLogin(nextAuth: Session) {
    const session: Auth = {
      idInstance: nextAuth.idInstance,
      apiTokenInstance: nextAuth.apiTokenInstance,
      apiUrl: nextAuth.apiUrl,
    }
    saveAuth(session)
    setAuth({ ...session, stateInstance: nextAuth.stateInstance || '' })
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_KEY)
    setAuth(null)
  }

  if (!auth) return <AuthScreen onSuccess={handleLogin} />
  return <ChatApp key={auth.idInstance} auth={auth} onLogout={handleLogout} />
}
