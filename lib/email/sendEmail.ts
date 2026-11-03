import nodemailer from 'nodemailer'

// Server-only. Sends through the league Gmail account over SMTP (free; see AGENTS.md "Cost
// constraint" and docs/POLL_REMINDERS_PLAN.md decision 3.1). Gmail rewrites any From address other
// than the authenticated account, so GMAIL_USER is also the From address.
//
// Until GMAIL_USER and GMAIL_APP_PASSWORD are both set, this logs the email instead of sending it
// ("dry run"), so the reminder pipeline can be exercised end to end before the account exists.

export type EmailMessage = {
  to: string
  subject: string
  text: string
}

export type SendResult = { dryRun: boolean }

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    console.log(
      `[email:dry-run] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`
    )
    return { dryRun: true }
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })
  await transporter.sendMail({
    from: `Cary Bengals <${user}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
  })
  return { dryRun: false }
}
