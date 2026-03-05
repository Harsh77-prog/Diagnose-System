const nextConfig = {
  // ✅ External packages that should run on server only
  serverExternalPackages: ["@prisma/client", "prisma"],
  
  // ✅ Bundle tracing for Prisma client
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/.prisma/client/**/*"],
  },
  
  // ✅ OPTIMIZATION: Image optimization with modern formats
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year for static images
  },
  
  // ✅ OPTIMIZATION: Enable SWR (Stale While Revalidate) for static assets
  swcMinify: true,
  
  // ✅ OPTIMIZATION: Optimize bundle size
  compress: true,
  productionBrowserSourceMaps: false,
  
  // ✅ OPTIMIZATION: Experimental features for faster builds
  experimental: {
    optimizePackageImports: ["@radix-ui/react-*", "lucide-react"],
    // DisableStaticImages: false, // Keep Next.js image optimization
  },
};

export default nextConfig;
