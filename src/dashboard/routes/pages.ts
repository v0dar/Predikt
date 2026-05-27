import { Router } from 'express';
import { join } from 'path';

export const pagesRouter = Router();

const publicDir = join(process.cwd(), 'src', 'dashboard', 'public');

// Standalone auth pages (outside SPA)
pagesRouter.get('/login',  (_req, res) => res.sendFile(join(publicDir, 'login.html')));
pagesRouter.get('/signup', (_req, res) => res.sendFile(join(publicDir, 'signup.html')));

// All other routes serve the SPA shell — the client-side router handles content
const spaRoutes = ['/', '/trades', '/markets', '/analytics', '/backtesting', '/settings', '/logs', '/wallet'];
for (const route of spaRoutes) {
  pagesRouter.get(route, (_req, res) => res.sendFile(join(publicDir, 'shell.html')));
}
