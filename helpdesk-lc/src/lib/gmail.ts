/**
 * Gmail Service
 * Handles Gmail API integration for reading emails, managing labels,
 * and sending replies.
 * 
 * Reused from ContaResidencial's gmail.service.ts (~80% reutilizable).
 * Adapted from Prisma → Drizzle for token management.
 * 
 * Functions:
 * - getGmailClient(unitId): Get authenticated Gmail client
 * - fetchHelpdeskEmails(unitId): Fetch text emails (not invoices)
 * - getEmailBody(payload): Extract plain text / HTML body from email
 * - getAttachment(unitId, messageId, attachmentId): Download attachment
 * - sendReply(unitId, threadId, to, subject, body): Reply within thread
 * - markAsRead(unitId, messageId): Mark email as read
 * - ensureLabel(unitId, labelName): Create/find Gmail label
 * - markAsProcessed(unitId, messageId, labelId): Apply label to email
 */

export {}
