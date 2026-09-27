// Общие типы чата и ответов GREEN-API.

export type Auth = {
  idInstance: string
  apiTokenInstance: string
  apiUrl: string
}

export type Session = Auth & {
  stateInstance?: string
}

export type MessageStatus = 'sending' | 'sent' | 'error'

export type ChatMessage = {
  id: string
  text: string
  outgoing: boolean
  timestamp: number
  status: MessageStatus
}

export type Chat = {
  id: string
  phone: string
  title: string
  unread: number
  messages: ChatMessage[]
}

export type InstanceState = {
  stateInstance?: string
}

export type InstanceSettings = {
  webhookUrl?: string
  incomingWebhook?: string
}

export type WhatsappAccount = {
  existsWhatsapp?: boolean
  chatId?: string
  username?: string
  phoneNumber?: string | number
}

export type SentMessage = {
  idMessage: string
}

export type SenderData = {
  chatId?: string | number
  chatName?: string
  senderName?: string
  senderContactName?: string
  senderPhoneNumber?: string | number
}

export type MessageData = {
  typeMessage?: string
  textMessageData?: { textMessage?: string }
  extendedTextMessageData?: { text?: string }
}

export type NotificationBody = {
  typeWebhook?: string
  timestamp?: number
  idMessage?: string
  senderData?: SenderData
  messageData?: MessageData
}

export type Notification = {
  receiptId: number
  body?: NotificationBody
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
