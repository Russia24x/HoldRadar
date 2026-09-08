import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { NextAbstractWalletProvider } from "@/components/agw/AgwProvider";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "HoldRadar — رادار ارزش برای هولدر",
  description:
    "رتبه‌بندی روزانهٔ ۲۵ دارایی برتر بر اساس «امتیاز ارزش برای هولدر»: بازده واقعی، کمیابی، بازخرید و سوزاندن، بلوغ و اکوسیستم. دسترسی با پرداخت یک دلاری روی Abstract یا سولانا.",
  keywords: ["HoldRadar", "رتبه‌بندی ارز دیجیتال", "ارزش برای هولدر", "Real Yield", "Abstract", "Solana", "PENGU", "x402"],
  openGraph: {
    title: "HoldRadar — رادار ارزش برای هولدر",
    description: "۲۵ دارایی برترِ امروز برای هولد، با یک دلار باز شود.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07090D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body
        className={`${vazirmatn.variable} font-sans antialiased bg-[#07090D] text-zinc-100 min-h-screen flex flex-col`}
      >
        <NextAbstractWalletProvider>
          {children}
          <Toaster />
        </NextAbstractWalletProvider>
      </body>
    </html>
  );
}
