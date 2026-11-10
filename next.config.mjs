/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API routes read the dictionary and syllable pool from disk on the server.
  outputFileTracingIncludes: { "/api/**": ["./public/dict/**"] },
};
export default nextConfig;
