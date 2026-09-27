import type { Chat, ChatMessage, MessageData, NotificationBody, SenderData, WhatsappAccount } from './types'

const TEXT_TYPES = new Set(['textMessage', 'extendedTextMessage', 'quotedMessage'])

// Российский номер 8… приводим к международному 7….
export function normalizePhone(value: string) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`
  }
  if (digits.length < 10 || digits.length > 15) return ''
  return digits
}

export function formatPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`
  }
  return digits ? `+${digits}` : ''
}

// Берём только текст. Файлы и статусы в чат не попадают.
export function extractText(messageData?: MessageData) {
  if (!messageData || !messageData.typeMessage || !TEXT_TYPES.has(messageData.typeMessage)) return null

  const text =
    messageData.textMessageData?.textMessage ??
    messageData.extendedTextMessageData?.text

  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  return trimmed ? text : null
}

export function chatFromAccount(rawPhone: string, account: WhatsappAccount): Chat {
  const username = typeof account.username === 'string' ? account.username.trim() : ''
  const phone = phoneDigits(account.phoneNumber) || rawPhone

  return {
    id: account.chatId ? String(account.chatId) : `${rawPhone}@c.us`,
    phone,
    title: username || formatPhone(rawPhone),
    unread: 0,
    messages: [],
  }
}

function phoneDigits(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits && digits !== '0' ? digits : ''
}

function phoneFromPersonalChatId(chatId: unknown) {
  const value = String(chatId || '')
  if (!value.endsWith('@c.us')) return ''
  return phoneDigits(value)
}

function senderPhone(sender?: SenderData) {
  return phoneDigits(sender?.senderPhoneNumber) || phoneFromPersonalChatId(sender?.chatId)
}

function samePhone(chat: Chat, sender?: SenderData) {
  const incoming = senderPhone(sender)
  const known = phoneDigits(chat.phone) || phoneFromPersonalChatId(chat.id)
  return Boolean(incoming && known) && incoming === known
}

function betterTitle(chat: Chat, sender?: SenderData) {
  const incoming = sender?.chatName || sender?.senderContactName || sender?.senderName || ''
  if (!incoming) return chat.title
  const generic = new Set([chat.id, chat.phone, formatPhone(chat.phone), `+${chat.phone}`])
  if (!chat.title || generic.has(chat.title)) return incoming
  return chat.title
}

// Ответ может прийти с chatId вида @lid, поэтому чат ищем ещё и по номеру телефона.
export function applyNotification(chats: Chat[], body?: NotificationBody, activeChatId = '') {
  if (!body) return chats

  const type = body.typeWebhook
  const outgoing = type === 'outgoingMessageReceived' || type === 'outgoingAPIMessageReceived'
  if (type !== 'incomingMessageReceived' && !outgoing) {
    return chats
  }

  const text = extractText(body.messageData)
  const sender = body.senderData
  const chatId = sender?.chatId != null ? String(sender.chatId) : ''
  if (!text || !chatId) return chats

  const message: ChatMessage = {
    id: String(body.idMessage || `${body.timestamp || Date.now()}-${chatId}`),
    text,
    outgoing,
    timestamp: Number(body.timestamp) ? Number(body.timestamp) * 1000 : Date.now(),
    status: 'sent',
  }

  const index = chats.findIndex((chat) => chat.id === chatId || samePhone(chat, sender))

  if (index === -1) {
    return [
      {
        id: chatId,
        phone: senderPhone(sender),
        title:
          sender?.chatName ||
          sender?.senderContactName ||
          sender?.senderName ||
          formatPhone(senderPhone(sender)) ||
          chatId,
        unread: message.outgoing || chatId === activeChatId ? 0 : 1,
        messages: [message],
      },
      ...chats,
    ]
  }

  const chat = chats[index]
  if (chat.messages.some((item) => item.id === message.id)) return chats

  const isActive = chat.id === activeChatId
  const nextChat: Chat = {
    ...chat,
    phone: chat.phone || senderPhone(sender),
    title: betterTitle(chat, sender),
    unread: message.outgoing || isActive ? 0 : (chat.unread || 0) + 1,
    messages: [...chat.messages, message].slice(-200),
  }

  return [nextChat, ...chats.filter((_, itemIndex) => itemIndex !== index)]
}

export function appendOutgoing(chats: Chat[], chatId: string, message: ChatMessage) {
  return chats.map((chat) =>
    chat.id === chatId
      ? { ...chat, messages: [...chat.messages, message].slice(-200) }
      : chat,
  )
}

export function confirmOutgoing(chats: Chat[], chatId: string, tempId: string, idMessage: string) {
  return chats.map((chat) => {
    if (chat.id !== chatId) return chat
    const alreadySaved = chat.messages.some((item) => item.id === idMessage)
    return {
      ...chat,
      messages: alreadySaved
        ? chat.messages.filter((item) => item.id !== tempId)
        : chat.messages.map((item) =>
            item.id === tempId ? { ...item, id: idMessage, status: 'sent' as const } : item,
          ),
    }
  })
}

export function failOutgoing(chats: Chat[], chatId: string, tempId: string) {
  return chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          messages: chat.messages.map((item) =>
            item.id === tempId ? { ...item, status: 'error' as const } : item,
          ),
        }
      : chat,
  )
}

export function markChatRead(chats: Chat[], chatId: string) {
  return chats.map((chat) => (chat.id === chatId ? { ...chat, unread: 0 } : chat))
}
