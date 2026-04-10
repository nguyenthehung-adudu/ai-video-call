import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/',
  '/upcoming',
  '/meeting(.*)',
  '/previous',
  '/recordings',
  '/personal-room',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const session = await auth();

    if (!session?.userId) {
      return session?.redirectToSignIn();
    }
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};