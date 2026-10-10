import "./globals.css";

export const metadata = {
  title: "Music System",
  description: "Manage songs, moods, and atmospheres"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
