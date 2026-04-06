import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/agent(.*)',
  '/dev(.*)',
  '/memory(.*)',
  '/tasks(.*)',
  '/profile(.*)',
]);

// Named export 'proxy' is an alternative convention, but standard middleware.ts is safer
export const proxy = clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth.protect();
  }
});

// Default export is mandatory for Next.js middleware
export default proxy;

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
