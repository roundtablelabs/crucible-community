# Crucible Community Edition - Frontend

This package implements the Crucible client experience, including public marketing pages, authentication flows, and the authenticated application shell for running sessions.

## Local Development Setup

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (for NextAuth session storage)
- Local API server running (see [API README](../service/README.md))

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and set:
   - `NEXT_PUBLIC_API_URL=http://localhost:8000/api` (points to local API)
   - `NEXTAUTH_URL=http://localhost:3000`
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `AUTH_DATABASE_URL` (PostgreSQL connection string)
   - OAuth provider credentials (at least one required)

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Open http://localhost:3000 in your browser

### Environment Variables

See `.env.example` for all available environment variables. Key variables:

- `NEXT_PUBLIC_API_URL` - Backend API URL (defaults to `http://localhost:8000/api` in development)
- `NEXTAUTH_URL` - NextAuth base URL
- `NEXTAUTH_SECRET` - NextAuth encryption secret (required)
- `AUTH_DATABASE_URL` - PostgreSQL connection string for NextAuth
- OAuth provider variables (Google, LinkedIn, Microsoft)

For detailed setup instructions, see [LOCAL_DEVELOPMENT.md](../../documentation/setup/LOCAL_DEVELOPMENT.md).

## Development

```bash
npm run dev
```

Routes are organised into App Router groups:
- `app/(public)` - marketing, pricing, how-it-works, legal pages
- `app/auth` - signin, signup, reset-password, error pages with Zod + react-hook-form validation
- `app/(app)` - authenticated dashboard, preflight, session room, artifacts, knights, billing, settings

## Tech stack

- Tailwind CSS v4 with brand tokens defined in `styles/tokens.css`
- Radix dialog + lucide icons for lightweight UI primitives
- TanStack Query provider wired in `app/layout.tsx`
- Feature-first folders in `features/` (sessions, auth, payments, knights)

## Testing

Lint the codebase via:

```bash
npm run lint
```

Vitest / Playwright suites will be added as the feature surface hardens.

## Troubleshooting

### API Connection Issues

If you see "Failed to fetch" or CORS errors:

1. Verify the API is running at `http://localhost:8000`
2. Check `NEXT_PUBLIC_API_URL` in `.env.local` is set correctly
3. Ensure API CORS configuration includes `http://localhost:3000`
4. Check browser console for specific error messages

### Authentication Issues

If OAuth sign-in doesn't work:

1. Verify `NEXTAUTH_SECRET` is set and not the example value
2. Check OAuth redirect URIs include `http://localhost:3000/api/auth/callback/{provider}`
3. Ensure `AUTH_DATABASE_URL` is correct and database is accessible
4. Verify OAuth provider credentials are correct
