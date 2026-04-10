import type { Metadata } from 'next'
import './globals.css'
import AppLayout from './_components/AppLayout'

export const metadata: Metadata = {
  title: 'Subul — سُبُل',
  description: 'Votre guide vers la certification IT',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  )
}
