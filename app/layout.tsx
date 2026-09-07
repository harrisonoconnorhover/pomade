import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './workspace.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://pomade.deleteddeleted.chatgpt.site'),
  title: 'Pomade — Shape your GTM data',
  description:
    'A programmable GTM grid for turning raw account data into receipted, governed workflows.',
  openGraph: {
    title: 'Pomade — Shape your GTM data',
    description:
      'A programmable GTM grid for turning raw account data into receipted, governed workflows.',
    url: '/',
    siteName: 'Pomade',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1731,
        height: 909,
        alt: 'Pomade — Shape your GTM data.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pomade — Shape your GTM data',
    description:
      'A programmable GTM grid for turning raw account data into receipted, governed workflows.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
