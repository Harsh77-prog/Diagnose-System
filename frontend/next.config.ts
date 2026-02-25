const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/**/*': ['./node_modules/.prisma/client/**/*'],
    },
  },
};

export default nextConfig;
