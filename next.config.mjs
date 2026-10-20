/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === 'true';
const basePath = isPages ? '/cost-Allocation' : '';

const nextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  ...(isPages
    ? {
        output: 'export',
        basePath,
        assetPrefix: basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || basePath,
    NEXT_PUBLIC_STORAGE: process.env.NEXT_PUBLIC_STORAGE || (isPages ? 'local' : 'server'),
  },
};

export default nextConfig;
