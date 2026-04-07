import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/agent(.*)',
  '/dev(.*)',
  '/memory(.*)',
  '/tasks(.*)',
  '/profile(.*)',
]);

// Named export 'proxy' is the requirement for Next.js 16
export const proxy = clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // 1. Skip all API routes in middleware to prevent double-processing and redirects
  // API routes manage their own authentication internally
  if (pathname.startsWith('/api/')) {
    return;
  }

  // 2. Standard page protection
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default proxy;

export const config = {
  matcher: [
    // Standard Next.js/Clerk matcher
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes (though we bypass logic inside the proxy)
    '/(api|trpc)(.*)',
  ],
};
