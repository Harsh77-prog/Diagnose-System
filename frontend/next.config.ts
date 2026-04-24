import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    serverExternalPackages: ["@prisma/client", "prisma"],
    outputFileTracingIncludes: {
        "/**/*": ["./node_modules/.prisma/client/**/*"],
    },
    images: {
        formats: ["image/avif", "image/webp"],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        minimumCacheTTL: 31_536_000,
    },
    compress: true,
    productionBrowserSourceMaps: false,
    experimental: {
        optimizePackageImports: ["@radix-ui/react-*", "lucide-react"],
    },
};

export default nextConfig;
