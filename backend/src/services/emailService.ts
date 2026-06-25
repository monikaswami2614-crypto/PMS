import { Resend } from 'resend';

interface SendMailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export const sendMail = async ({ to, subject, html, text }: SendMailInput): Promise<string> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !from) {
    throw new EmailConfigurationError('Resend email is not configured. Set RESEND_API_KEY and RESEND_FROM.');
  }

  if (!html?.trim() && !text?.trim()) {
    throw new EmailConfigurationError('Email content is required.');
  }

  const resend = new Resend(apiKey);
  const normalizedHtml = html?.trim();
  const normalizedText = text?.trim();
  const result = normalizedHtml
    ? await resend.emails.send({
        from,
        to,
        subject,
        html: normalizedHtml,
        text: normalizedText,
      })
    : await resend.emails.send({
        from,
        to,
        subject,
        text: normalizedText as string,
      });
  const { data, error } = result;

  if (error) {
    throw new EmailDeliveryError(error.message || 'Resend rejected the email.');
  }

  if (!data?.id) {
    throw new EmailDeliveryError('Resend did not return an email ID.');
  }

  return data.id;
};
