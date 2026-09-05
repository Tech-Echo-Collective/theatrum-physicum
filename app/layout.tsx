import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Theatrum Physicum',
  description: 'Define a physical world. Part of Tech Echo Physica.',
  icons: { icon: '/assets/theatrum-physicum.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
