import type { Metadata, Viewport } from "next"

import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { BarkadaProvider } from "@/components/barkada/providers"
import { PwaRegister } from "@/components/pwa-register"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://barkada-split-bywn.vercel.app"),
  title: "Tally — Bill Splitter",
  description: "Split group trip expenses with friends. Records marks only — no real payments.",
  applicationName: "Tally",
  appleWebApp: {
    capable: true,
    title: "Tally",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Tally — Bill Splitter",
    description: "Don't forget who owes what. Tap to claim your name, log expenses, and settle up via GCash.",
    siteName: "Tally",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tally — Bill Splitter",
    description: "Don't forget who owes what. Tap to claim your name, log expenses, and settle up via GCash.",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body>
        <ThemeProvider>
          <Toaster>
            <BarkadaProvider>
              {children}
              <PwaRegister />
            </BarkadaProvider>
          </Toaster>
        </ThemeProvider>
      </body>
    </html>
  )
}
