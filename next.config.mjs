/** @type {import('next').NextConfig} */
const nextConfig = {
  // unpdf empaqueta pdf.js con assets propios: mejor fuera del bundle del servidor
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
