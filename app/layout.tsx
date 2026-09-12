import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mira AI",
  description: "多模型 AI 对话系统（Alpha / Beta / Gamma / Guide）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-screen overflow-hidden antialiased`}
    >
      <body className="h-screen overflow-hidden bg-background text-foreground">
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
