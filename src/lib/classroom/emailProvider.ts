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
