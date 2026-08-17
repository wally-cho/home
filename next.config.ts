import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 배포용. .next/standalone 에 실행에 필요한 것만 모아준다
  output: 'standalone',
};

export default nextConfig;
