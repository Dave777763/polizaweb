import "./globals.css";
import Nav from "@/components/nav";

export const metadata = {
  title: "PólizaWeb",
  description: "Sube y consulta las pólizas de la flotilla en cualquier momento",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
