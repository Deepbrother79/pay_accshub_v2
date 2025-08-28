# Pay AccsHub - Claude Code Configuration

## Project Overview

Pay AccsHub is a React-based application for managing token credits and payments. Built with modern web technologies including React, TypeScript, Vite, and Supabase as the backend.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Library**: shadcn/ui + Radix UI + Tailwind CSS
- **Backend**: Supabase (Database + Edge Functions)
- **State Management**: TanStack React Query
- **Routing**: React Router DOM
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS + CSS Variables
- **Icons**: Lucide React

## Project Structure

```
src/
├── components/           # Reusable components
│   ├── ui/              # shadcn/ui components
│   └── ProtectedRoute.tsx
├── hooks/               # Custom React hooks
├── integrations/        # External service integrations
│   └── supabase/       # Supabase client and types
├── lib/                 # Utility functions
├── pages/               # Page components
│   ├── Auth.tsx        # Authentication page
│   ├── Dashboard.tsx   # Main dashboard
│   ├── Admin.tsx       # Admin panel
│   ├── Index.tsx       # Landing page
│   └── NotFound.tsx    # 404 page
└── main.tsx            # App entry point

supabase/
├── functions/          # Edge functions
│   ├── create-invoice/ # Invoice creation
│   ├── generate-tokens/# Token generation
│   ├── nowpayments-ipn/# Payment webhooks
│   └── refill-tokens/  # Token refill system
└── migrations/         # Database migrations
```

## Development Commands

- **Development**: `npm run dev` (starts Vite dev server)
- **Build**: `npm run build` (production build)
- **Build (Dev)**: `npm run build:dev` (development build)
- **Lint**: `npm run lint` (ESLint check)
- **Preview**: `npm run preview` (preview production build)

## Key Features

1. **Token Management System**
   - Generate product tokens and master tokens
   - Token refill functionality with USD/credits modes
   - Token history tracking

2. **Payment Integration**
   - NowPayments integration for cryptocurrency payments
   - Invoice generation and tracking
   - Payment status monitoring

3. **Dashboard Features**
   - User balance display
   - Transaction history
   - Payment history with real-time updates
   - Export functionality for transactions

4. **Authentication**
   - Supabase Auth integration
   - Protected routes
   - Admin panel access control

## Database Schema

The application uses Supabase with the following main tables:
- `products` - Available products/services
- `transactions` - Token generation transactions
- `refill_transactions` - Token refill transactions
- `payments` - Payment records
- User profiles and authentication via Supabase Auth

## Environment Configuration

Supabase project ID: `raqwrslwuefyikijlbma`

## Development Notes

- Uses React 18 with modern patterns (hooks, functional components)
- TypeScript for type safety
- Responsive design with Tailwind CSS
- Real-time data updates using Supabase subscriptions
- Form validation with Zod schemas
- Error handling with toast notifications

## Deployment

The project is configured for Vercel deployment with `vercel.json` configuration file.

## MCP Integration

Supabase MCP server is configured for enhanced development experience with Claude Code.