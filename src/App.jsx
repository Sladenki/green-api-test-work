import { useEffect, useRef, useState } from 'react'
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
import './App.css'

const AUTH_KEY = 'wa-chat-auth'

const AVATAR_COLORS = ['#2f80ed', '#1f9d8a', '#6d5efc', '#e07a3d', '#d4527a', '#3d8b8b']

function chatsKey(idInstance) {
  return `wa-chat-chats:${idInstance}`
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function readAuth() {
  const data = readJson(AUTH_KEY, null)
  if (!data?.idInstance || !data?.apiTokenInstance) return null
  return {
    idInstance: String(data.idInstance).trim(),
    apiTokenInstance: String(data.apiTokenInstance).trim(),
    apiUrl: String(data.apiUrl || DEFAULT_API_URL).trim(),
  }
}

function readChats(idInstance) {
  const chats = readJson(chatsKey(idInstance), [])
  return Array.isArray(chats) ? chats : []
}

function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

function colorFrom(value) {
  const text = String(value || '')
  const index = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDay(timestamp) {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Сегодня'
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function sameDay(left, right) {
  const a = new Date(left)
  const b = new Date(right)
  return a.toDateString() === b.toDateString()
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
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

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function Avatar({ title, size = 44 }) {
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

function AuthScreen({ onSuccess }) {
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL)
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const auth = {
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
      onSuccess({ ...auth, stateInstance: state?.stateInstance || '' })
    } catch (requestError) {
      setError(requestError.message)
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

function ChatApp({ auth, onLogout }) {
  const [chats, setChats] = useState(() => readChats(auth.idInstance))
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
  const threadRef = useRef(null)
  const draftRef = useRef(null)
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

  useEffect(() => {
    const controller = new AbortController()
    let stopped = false

    getStateInstance(auth, controller.signal)
      .then((state) => {
        if (!stopped) setStateInstance(state?.stateInstance || '')
      })
      .catch((error) => {
        if (error.name === 'AbortError' || stopped) return
        setPollError(explainReceiveError(error.message))
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
        if (error.name === 'AbortError' || stopped) return
        if (!stopped) setPollError(explainReceiveError(error.message))
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
          if (error.name === 'AbortError' || stopped) return
          if (!stopped) setPollError(explainReceiveError(error.message))
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

  function openChat(chatId) {
    activeIdRef.current = chatId
    setActiveChatId(chatId)
    setChats((current) => markChatRead(current, chatId))
    setMobileChat(true)
    setDraft('')
  }

  async function handleCreate(event) {
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
      if (!account?.existsWhatsapp) {
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
      setFormError(error.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleSend(event) {
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
      setChats((current) => confirmOutgoing(current, chatId, tempId, String(result.idMessage)))
    } catch (error) {
      setChats((current) => failOutgoing(current, chatId, tempId))
      setPollError(error.message)
    } finally {
      setSending(false)
    }
  }

  function handleDraftKeyDown(event) {
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
                        <div className={`bubble ${message.status || 'sent'}`}>
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

function explainReceiveError(message) {
  const text = String(message || '')
  if (/starting or not authorized/i.test(text)) {
    return 'Инстанс ещё запускается. Подождите, пока внизу появится «WhatsApp подключен», и попросите друга написать ещё раз.'
  }
  if (/webhook url is set/i.test(text)) {
    return 'В кабинете указан webhook, поэтому ответ не попадает в чат. Очистите webhook и включите входящие уведомления.'
  }
  return text || 'Не удалось получить сообщения'
}

function StatusMark({ status }) {
  if (status === 'sending') return <span>…</span>
  if (status === 'error') return <span>не отправлено</span>
  return <span>✓</span>
}

export default function App() {
  const [auth, setAuth] = useState(readAuth)

  function handleLogin(nextAuth) {
    const session = {
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
