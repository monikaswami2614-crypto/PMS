import net from 'node:net';
import tls from 'node:tls';

interface SendMailInput {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
}

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

const readResponse = (socket: net.Socket | tls.TLSSocket): Promise<string> => new Promise((resolve, reject) => {
  const chunks: string[] = [];
  const onData = (chunk: Buffer) => {
    chunks.push(chunk.toString('utf8'));
    const response = chunks.join('');
    const lines = response.trimEnd().split(/\r?\n/);
    const lastLine = lines[lines.length - 1] ?? '';

    if (/^\d{3}\s/.test(lastLine)) {
      socket.off('data', onData);
      resolve(response);
    }
  };

  socket.on('data', onData);
  socket.once('error', reject);
});

const sendCommand = async (socket: net.Socket | tls.TLSSocket, command: string, expectedCodes: number[]) => {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));

  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP command failed (${code}): ${response.trim()}`);
  }
};

const escapeMailText = (value: string): string => value.replace(/^\./gm, '..');

export const sendMail = async ({ to, replyTo, subject, text }: SendMailInput): Promise<void> => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const secure = (process.env.SMTP_SECURE ?? 'true').toLowerCase() !== 'false';
  const placeholderValues = new Set(['your_email@gmail.com', 'your_app_password']);

  if (!host || !user || !pass || !from || placeholderValues.has(user) || placeholderValues.has(pass) || placeholderValues.has(from)) {
    throw new EmailConfigurationError('Email SMTP is not configured with real credentials.');
  }

  const socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  socket.setTimeout(20000);

  try {
    await readResponse(socket);
    await sendCommand(socket, `EHLO ${process.env.SMTP_CLIENT_NAME || 'localhost'}`, [250]);
    await sendCommand(socket, 'AUTH LOGIN', [334]);
    await sendCommand(socket, Buffer.from(user).toString('base64'), [334]);
    await sendCommand(socket, Buffer.from(pass).toString('base64'), [235]);
    await sendCommand(socket, `MAIL FROM:<${from}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await sendCommand(socket, 'DATA', [354]);

    const message = [
      `From: ${from}`,
      `To: ${to}`,
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      escapeMailText(text),
      '.',
    ].join('\r\n');

    await sendCommand(socket, message, [250]);
    await sendCommand(socket, 'QUIT', [221]);
  } finally {
    socket.end();
  }
};
