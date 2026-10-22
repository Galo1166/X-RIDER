const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiPort = process.env.API_PORT || "4000";
    return [{ source: "/api/:path*", destination: `http://127.0.0.1:${apiPort}/api/:path*` }];
  },
};

export default nextConfig;
