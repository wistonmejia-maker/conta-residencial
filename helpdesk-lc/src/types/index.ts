/**
 * TypeScript Types for Helpdesk LC
 * Centralized type definitions for the application.
 */

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_RESPONSE' | 'RESOLVED' | 'CLOSED'

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type TicketCategory = 'MANTENIMIENTO' | 'PAGOS' | 'QUEJA' | 'SOLICITUD' | 'EMERGENCIA' | 'OTRO'

export type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'NOTE'

export type TicketSource = 'EMAIL' | 'MANUAL' | 'PHONE'

export interface Ticket {
  id: string
  unitId: string
  ticketNumber: number
  subject: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory | null
  requesterName: string | null
  requesterEmail: string
  requesterUnit: string | null
  gmailMessageId: string | null
  gmailThreadId: string | null
  source: TicketSource
  aiSummary: string | null
  aiSentiment: string | null
  aiSuggestedReply: string | null
  assignedTo: string | null
  resolvedAt: Date | null
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
  messages?: TicketMessage[]
  tags?: TicketTag[]
}

export interface TicketMessage {
  id: string
  ticketId: string
  direction: MessageDirection
  body: string
  bodyPlain: string | null
  senderEmail: string | null
  senderName: string | null
  gmailMessageId: string | null
  attachments: Attachment[] | null
  createdAt: Date
}

export interface TicketTag {
  id: string
  ticketId: string
  tag: string
}

export interface Attachment {
  name: string
  url: string
  size: number
  type: string
}

export interface Unit {
  id: string
  name: string
  taxId: string
  email: string | null
  gmailConnected: boolean
  createdAt: Date
}

export interface TicketStats {
  total: number
  open: number
  inProgress: number
  waitingResponse: number
  resolved: number
  closed: number
  avgResponseTimeHours: number
}

export interface TicketFilters {
  status?: TicketStatus[]
  priority?: TicketPriority[]
  category?: TicketCategory[]
  assignedTo?: string
  search?: string
  unitId?: string
}
