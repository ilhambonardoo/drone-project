import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pantau Drone — DreamPalm",
  description:
    "Monitoring kamera multispektral dan analisis kesehatan kanopi.",
  icons: {
    icon: "/logomark.png",
    apple: "/logomark.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full">
      <body className="min-h-full flex flex-col bg-[#F5F5FA] text-[#1C1D21]">
        {children}
      </body>
    </html>
  );
}
