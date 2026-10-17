/**
 * emailProvider.ts
 *
 * Pluggable Email Delivery Provider Interface:
 * 1. Checks RESEND_API_KEY environment variable.
 * 2. If configured, dispatches transactional emails via Resend HTTP API.
 * 3. If unconfigured, safely logs the action without throwing, and returns
 *    a structured result indicating simulated / blocked delivery status.
 */

export interface EmailDispatchOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  provider: "resend" | "mock";
  messageId?: string;
  error?: string;
  deliveryStatus: "sent" | "simulated_local" | "unconfigured";
}

export async function sendTransactionalEmail(
  opts: EmailDispatchOptions
): Promise<EmailDispatchResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = opts.from || process.env.EMAIL_FROM || "OutputTracer Classroom <noreply@outputtracer.com>";

  if (!apiKey) {
    // Graceful unconfigured fallback
    return {
      success: true,
      provider: "mock",
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      deliveryStatus: "simulated_local",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        provider: "resend",
        error: data.message || "Failed to dispatch email through Resend API",
        deliveryStatus: "unconfigured",
      };
    }

    return {
      success: true,
      provider: "resend",
      messageId: data.id,
      deliveryStatus: "sent",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error contacting email provider";
    return {
      success: false,
      provider: "resend",
      error: message,
      deliveryStatus: "unconfigured",
    };
  }
}

/**
 * Notifies the platform owner whenever a new teacher verification application is submitted.
 */
export async function notifyPlatformOwnerNewTeacherApplication(opts: {
  applicantName: string;
  applicantEmail: string;
  institutionName: string;
  department?: string;
  submittedAt: string;
  reviewUrl: string;
}): Promise<EmailDispatchResult> {
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL || "owner@outputtracer.com";
  const dateFormatted = new Date(opts.submittedAt).toUTCString();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #EAEAEA; border-radius: 8px; background-color: #FAFAFA;">
      <h2 style="color: #000000; font-size: 18px; margin-top: 0;">New Educator Verification Application</h2>
      <p style="color: #555555; font-size: 14px; line-height: 1.5;">
        A new educator application has been submitted on OutputTracer and is waiting for administrator review.
      </p>
      <div style="background-color: #FFFFFF; border: 1px solid #EAEAEA; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 13px; color: #222222; line-height: 1.6;">
        <p style="margin: 0 0 6px 0;"><strong>Applicant:</strong> ${opts.applicantName} (&lt;${opts.applicantEmail}&gt;)</p>
        <p style="margin: 0 0 6px 0;"><strong>Institution:</strong> ${opts.institutionName}${opts.department ? ` (${opts.department})` : ""}</p>
        <p style="margin: 0;"><strong>Submitted:</strong> ${dateFormatted}</p>
      </div>
      <div style="margin-top: 24px;">
        <a href="${opts.reviewUrl}" style="background-color: #000000; color: #FFFFFF; text-decoration: none; padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 4px; display: inline-block;">
          Review Application in Admin Center &rarr;
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #EAEAEA; margin: 30px 0 16px 0;" />
      <p style="font-size: 11px; color: #999999; margin: 0;">OutputTracer Security & Administration System</p>
    </div>
  `;

  return sendTransactionalEmail({
    to: ownerEmail,
    subject: `[OutputTracer] New Educator Application: ${opts.applicantName} (${opts.institutionName})`,
    html,
  });
}

/**
 * Notifies a teacher applicant of their application outcome (approved or rejected).
 */
export async function notifyTeacherApplicationDecision(opts: {
  recipientEmail: string;
  recipientName: string;
  decision: "approved" | "rejected";
  reviewerNotes?: string;
  actionUrl: string;
}): Promise<EmailDispatchResult> {
  const isApproved = opts.decision === "approved";
  const subject = isApproved
    ? "Welcome to OutputTracer Educator Studio — Application Approved"
    : "Update regarding your OutputTracer Educator Application";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #EAEAEA; border-radius: 8px; background-color: #FAFAFA;">
      <h2 style="color: ${isApproved ? "#007ACC" : "#111111"}; font-size: 18px; margin-top: 0;">
        ${isApproved ? "🎉 Educator Application Approved" : "Application Status Update"}
      </h2>
      <p style="color: #444444; font-size: 14px; line-height: 1.5;">
        Hello ${opts.recipientName},
      </p>
      <p style="color: #444444; font-size: 14px; line-height: 1.5;">
        ${
          isApproved
            ? "Your teacher verification application has been reviewed and approved! You now have full access to create classrooms, invite students, build assignments, and track code execution."
            : "Your educator verification application has been reviewed. At this time, additional institutional verification was required or could not be confirmed."
        }
      </p>
      ${
        opts.reviewerNotes
          ? `
          <div style="background-color: #FFFFFF; border-left: 3px solid ${isApproved ? "#007ACC" : "#DCDCDC"}; padding: 12px 16px; margin: 18px 0; font-size: 13px; color: #333333;">
            <strong>Reviewer Notes:</strong> ${opts.reviewerNotes}
          </div>
          `
          : ""
      }
      <div style="margin-top: 24px;">
        <a href="${opts.actionUrl}" style="background-color: #000000; color: #FFFFFF; text-decoration: none; padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 4px; display: inline-block;">
          ${isApproved ? "Open Educator Studio &rarr;" : "View Application Details &rarr;"}
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #EAEAEA; margin: 30px 0 16px 0;" />
      <p style="font-size: 11px; color: #999999; margin: 0;">OutputTracer Education Platform &bull; https://outputtracer.com</p>
    </div>
  `;

  return sendTransactionalEmail({
    to: opts.recipientEmail,
    subject,
    html,
  });
}
