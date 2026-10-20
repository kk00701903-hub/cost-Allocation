/** @type {import('next').NextConfig} */
// 정적 호스팅(Cloudflare Pages 등): STATIC_EXPORT=true
const isStatic = process.env.STATIC_EXPORT === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  ...(isStatic
    ? {
        output: 'export',
        basePath: basePath || undefined,
        assetPrefix: basePath || undefined,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STORAGE: process.env.NEXT_PUBLIC_STORAGE || (isStatic ? 'local' : 'server'),
  },
};

export default nextConfig;
