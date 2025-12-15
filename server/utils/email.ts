import { Resend } from 'resend'

// Only create Resend instance if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@yourdomain.com'
const APP_NAME = process.env.APP_NAME || 'Agency Dashboard'
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(options: EmailOptions) {
  // If no Resend API key, log email to console in development
  if (!resend) {
    console.log('=== EMAIL (no RESEND_API_KEY configured) ===')
    console.log('To:', options.to)
    console.log('Subject:', options.subject)
    console.log('HTML:', options.html.substring(0, 500) + '...')
    console.log('============================================')
    return { id: 'dev-mode-no-send' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    })

    if (error) {
      console.error('Failed to send email:', error)
      throw new Error(`Email send failed: ${error.message}`)
    }

    return { success: true, id: data?.id }
  } catch (error) {
    console.error('Email service error:', error)
    throw error
  }
}

// ============================================
// Email Templates
// ============================================

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #3b82f6;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px;
      color: #111827;
    }
    p {
      margin: 0 0 16px;
      color: #4b5563;
    }
    .button {
      display: inline-block;
      background: #3b82f6;
      color: white !important;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      margin: 16px 0;
    }
    .button:hover {
      background: #2563eb;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
    }
    .code {
      font-family: monospace;
      background: #f3f4f6;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 18px;
      letter-spacing: 2px;
      display: inline-block;
      margin: 8px 0;
    }
    .info-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
    .warning-box {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">${APP_NAME}</div>
      ${content}
      <div class="footer">
        <p>This email was sent by ${APP_NAME}.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
`

// ============================================
// Team Invitation Email
// ============================================
export async function sendInvitationEmail(params: {
  to: string
  inviterName: string
  inviterEmail: string
  role: string
  departments?: string[]
  message?: string
  token: string
  expiresAt: Date
}) {
  const inviteUrl = `${APP_URL}/invite/${params.token}`
  const expiresIn = Math.round((params.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  const departmentsList = params.departments?.length
    ? `<p><strong>Departments:</strong> ${params.departments.join(', ')}</p>`
    : ''

  const personalMessage = params.message
    ? `<div class="info-box"><strong>Message from ${params.inviterName}:</strong><br/>"${params.message}"</div>`
    : ''

  const html = baseTemplate(`
    <h1>You're invited to join ${APP_NAME}</h1>
    <p><strong>${params.inviterName}</strong> (${params.inviterEmail}) has invited you to join their team as a <strong>${params.role}</strong>.</p>
    ${personalMessage}
    ${departmentsList}
    <p>Click the button below to accept the invitation and create your account:</p>
    <a href="${inviteUrl}" class="button">Accept Invitation</a>
    <div class="warning-box">
      <strong>⏰ This invitation expires in ${expiresIn} days.</strong>
    </div>
    <p style="font-size: 12px; color: #9ca3af;">
      Or copy and paste this URL into your browser:<br/>
      <a href="${inviteUrl}" style="color: #3b82f6; word-break: break-all;">${inviteUrl}</a>
    </p>
  `)

  return sendEmail({
    to: params.to,
    subject: `${params.inviterName} invited you to join ${APP_NAME}`,
    html
  })
}

// ============================================
// Welcome Email (after signup/accepting invite)
// ============================================
export async function sendWelcomeEmail(params: {
  to: string
  name: string
}) {
  const html = baseTemplate(`
    <h1>Welcome to ${APP_NAME}, ${params.name}! 🎉</h1>
    <p>Your account has been successfully created. You're all set to start managing your agency's workflow.</p>
    <div class="info-box">
      <strong>Here's what you can do:</strong>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>View and manage tasks on Kanban boards</li>
        <li>Track project progress and deadlines</li>
        <li>Collaborate with your team</li>
        <li>Monitor workload and capacity</li>
      </ul>
    </div>
    <a href="${APP_URL}/agency/workflow" class="button">Go to Dashboard</a>
    <p>If you have any questions, feel free to reach out to your team admin.</p>
  `)

  return sendEmail({
    to: params.to,
    subject: `Welcome to ${APP_NAME}!`,
    html
  })
}

// ============================================
// Password Reset Email
// ============================================
export async function sendPasswordResetEmail(params: {
  to: string
  name: string
  token: string
  expiresAt: Date
}) {
  const resetUrl = `${APP_URL}/reset-password/${params.token}`
  const expiresIn = Math.round((params.expiresAt.getTime() - Date.now()) / (1000 * 60))

  const html = baseTemplate(`
    <h1>Reset Your Password</h1>
    <p>Hi ${params.name},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <div class="warning-box">
      <strong>⏰ This link expires in ${expiresIn} minutes.</strong>
    </div>
    <p style="font-size: 12px; color: #9ca3af;">
      Or copy and paste this URL into your browser:<br/>
      <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
    </p>
    <p>If you didn't request a password reset, please ignore this email or contact your administrator if you have concerns.</p>
  `)

  return sendEmail({
    to: params.to,
    subject: `Reset your ${APP_NAME} password`,
    html
  })
}

// ============================================
// Email Verification
// ============================================
export async function sendVerificationEmail(params: {
  to: string
  name: string
  token: string
}) {
  const verifyUrl = `${APP_URL}/verify-email/${params.token}`

  const html = baseTemplate(`
    <h1>Verify Your Email Address</h1>
    <p>Hi ${params.name},</p>
    <p>Please verify your email address by clicking the button below:</p>
    <a href="${verifyUrl}" class="button">Verify Email</a>
    <p style="font-size: 12px; color: #9ca3af;">
      Or copy and paste this URL into your browser:<br/>
      <a href="${verifyUrl}" style="color: #3b82f6; word-break: break-all;">${verifyUrl}</a>
    </p>
  `)

  return sendEmail({
    to: params.to,
    subject: `Verify your email for ${APP_NAME}`,
    html
  })
}

// ============================================
// Task Assignment Notification
// ============================================
export async function sendTaskAssignedEmail(params: {
  to: string
  assigneeName: string
  taskTitle: string
  taskId: string
  projectName?: string
  assignerName: string
  dueDate?: Date
  priority: string
}) {
  const taskUrl = `${APP_URL}/agency/workflow/tasks/${params.taskId}`
  const dueDateStr = params.dueDate
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(params.dueDate)
    : 'No due date'

  const priorityColors: Record<string, string> = {
    urgent: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#3b82f6'
  }

  const html = baseTemplate(`
    <h1>New Task Assigned to You</h1>
    <p>Hi ${params.assigneeName},</p>
    <p><strong>${params.assignerName}</strong> has assigned you a new task:</p>
    <div class="info-box">
      <h2 style="margin: 0 0 8px; font-size: 18px;">${params.taskTitle}</h2>
      ${params.projectName ? `<p style="margin: 4px 0;"><strong>Project:</strong> ${params.projectName}</p>` : ''}
      <p style="margin: 4px 0;"><strong>Due:</strong> ${dueDateStr}</p>
      <p style="margin: 4px 0;">
        <strong>Priority:</strong>
        <span style="color: ${priorityColors[params.priority] || '#6b7280'}; text-transform: capitalize;">
          ${params.priority}
        </span>
      </p>
    </div>
    <a href="${taskUrl}" class="button">View Task</a>
  `)

  return sendEmail({
    to: params.to,
    subject: `New task assigned: ${params.taskTitle}`,
    html
  })
}

// ============================================
// Comment Mention Notification
// ============================================
export async function sendMentionEmail(params: {
  to: string
  mentionedName: string
  mentionerName: string
  taskTitle: string
  taskId: string
  comment: string
}) {
  const taskUrl = `${APP_URL}/agency/workflow/tasks/${params.taskId}`
  const truncatedComment = params.comment.length > 200
    ? params.comment.substring(0, 200) + '...'
    : params.comment

  const html = baseTemplate(`
    <h1>You were mentioned in a comment</h1>
    <p>Hi ${params.mentionedName},</p>
    <p><strong>${params.mentionerName}</strong> mentioned you in a comment on <strong>${params.taskTitle}</strong>:</p>
    <div class="info-box">
      <p style="margin: 0; font-style: italic;">"${truncatedComment}"</p>
    </div>
    <a href="${taskUrl}" class="button">View Comment</a>
  `)

  return sendEmail({
    to: params.to,
    subject: `${params.mentionerName} mentioned you in ${params.taskTitle}`,
    html
  })
}

// ============================================
// Approval Request Notification
// ============================================
export async function sendApprovalRequestEmail(params: {
  to: string
  approverName: string
  requesterName: string
  taskTitle: string
  taskId: string
  stepName: string
}) {
  const taskUrl = `${APP_URL}/agency/workflow/tasks/${params.taskId}`

  const html = baseTemplate(`
    <h1>Approval Required</h1>
    <p>Hi ${params.approverName},</p>
    <p><strong>${params.requesterName}</strong> has requested your approval for:</p>
    <div class="info-box">
      <h2 style="margin: 0 0 8px; font-size: 18px;">${params.taskTitle}</h2>
      <p style="margin: 4px 0;"><strong>Approval Step:</strong> ${params.stepName}</p>
    </div>
    <a href="${taskUrl}" class="button">Review & Approve</a>
  `)

  return sendEmail({
    to: params.to,
    subject: `Approval needed: ${params.taskTitle}`,
    html
  })
}

// ============================================
// Due Date Reminder
// ============================================
export async function sendDueReminderEmail(params: {
  to: string
  userName: string
  tasks: Array<{ id: string; title: string; dueDate: Date; projectName?: string }>
}) {
  const tasksList = params.tasks.map(task => {
    const dueStr = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(task.dueDate)
    const taskUrl = `${APP_URL}/agency/workflow/tasks/${task.id}`
    return `
      <li style="margin-bottom: 12px;">
        <a href="${taskUrl}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">${task.title}</a>
        <br/>
        <span style="font-size: 12px; color: #6b7280;">
          Due: ${dueStr}${task.projectName ? ` • ${task.projectName}` : ''}
        </span>
      </li>
    `
  }).join('')

  const html = baseTemplate(`
    <h1>⏰ Task Due Date Reminder</h1>
    <p>Hi ${params.userName},</p>
    <p>You have ${params.tasks.length} task${params.tasks.length > 1 ? 's' : ''} due soon:</p>
    <ul style="padding-left: 20px;">
      ${tasksList}
    </ul>
    <a href="${APP_URL}/agency/workflow/my-tasks" class="button">View All My Tasks</a>
  `)

  return sendEmail({
    to: params.to,
    subject: `Reminder: ${params.tasks.length} task${params.tasks.length > 1 ? 's' : ''} due soon`,
    html
  })
}
