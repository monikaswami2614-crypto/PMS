import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kamal Cogent PMS',
  description: 'Kamal Cogent PMS - Modern project management system with integrated project and team workflows.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
