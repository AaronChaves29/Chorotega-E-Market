import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chorotega E-Market",
  description: "Marketplace para emprendedores de la región Chorotega.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}