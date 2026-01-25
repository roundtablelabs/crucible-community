// Next.js 13+ App Router icon handler
// This automatically serves as the favicon for all routes and subdomains

export default async function Icon() {
  // Generic fallback: simple SVG with "C" (Crucible)
  const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#0f172a" rx="4"/>
    <text x="16" y="22" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#f2c24f" text-anchor="middle">C</text>
  </svg>`;
  return new Response(fallback, {
    headers: { 
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
