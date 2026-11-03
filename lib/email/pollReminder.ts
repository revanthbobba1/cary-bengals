import { formatDeadline } from '@/lib/formatDeadline'
import siteMetadata from '@/data/siteMetadata'
import { sendEmail, type SendResult } from '@/lib/email/sendEmail'

export type PollReminderInput = {
  to: string
  fullName: string | null
  weekNumber: number
  deadline: string // ISO timestamp
}

export function buildPollReminder(input: PollReminderInput): { subject: string; text: string } {
  const hoursLeft = Math.max(
    1,
    Math.round((new Date(input.deadline).getTime() - Date.now()) / 3_600_000)
  )
  const greeting = input.fullName ? `Hi ${input.fullName},` : 'Hi,'
  return {
    subject: `Week ${input.weekNumber} power rankings close in about ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`,
    text: [
      greeting,
      '',
      `You haven't submitted your Week ${input.weekNumber} power rankings ballot yet. The poll closes ${formatDeadline(input.deadline)}.`,
      '',
      `Submit your ballot: ${siteMetadata.siteUrl}/admin/poll`,
      '',
      'Cary Bengals Fantasy Football',
    ].join('\n'),
  }
}

export async function sendPollReminder(input: PollReminderInput): Promise<SendResult> {
  return sendEmail({ to: input.to, ...buildPollReminder(input) })
}
