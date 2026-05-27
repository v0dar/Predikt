// ─── Auth routes ─────────────────────────────────────────────────────────────
// Handles Telegram Login Widget callback verification.
// The widget sends signed user data which we verify with HMAC-SHA256,
// then we create/find the Supabase user and return a session token.

import { Router } from 'express';
import { createHmac, createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export const authRouter = Router();

// Admin Supabase client with service role (can create users + generate links)
const adminClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

// ─── Telegram hash verification ───────────────────────────────────────────────
// Spec: https://core.telegram.org/widgets/login#checking-authorization

function verifyTelegramHash(data: Record<string, string>): boolean {
  if (!config.TELEGRAM_BOT_TOKEN) return false;

  const { hash, ...rest } = data;
  if (!hash) return false;

  // Check the auth is not older than 24 hours
  const authDate = parseInt(rest['auth_date'] ?? '0', 10);
  if (Date.now() / 1000 - authDate > 86_400) return false;

  // Build the data check string: key=value pairs sorted alphabetically, joined by \n
  const dataCheckString = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('\n');

  // Secret = SHA256(BOT_TOKEN) — NOT HMAC, just plain SHA256
  const secretKey = createHash('sha256').update(config.TELEGRAM_BOT_TOKEN).digest();
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return expectedHash === hash;
}

// ─── GET /auth/telegram — receives Telegram Login Widget redirect ─────────────

authRouter.get('/telegram', async (req, res) => {
  try {
    const data = req.query as Record<string, string>;

    if (!verifyTelegramHash(data)) {
      logger.warn('Telegram auth: invalid hash', { ip: req.ip });
      res.redirect('/login?error=invalid_telegram_auth');
      return;
    }

    const telegramId   = data['id']!;
    const firstName    = data['first_name'] ?? 'User';
    const lastName     = data['last_name']  ?? '';
    const username     = data['username']   ?? '';
    const displayName  = `${firstName} ${lastName}`.trim();

    // Synthetic email for Telegram users (Supabase requires email)
    const syntheticEmail = `tg_${telegramId}@predikt.app`;

    // Try to find existing user by email
    const { data: listData } = await adminClient.auth.admin.listUsers();
    const existingUser = listData?.users?.find(u => u.email === syntheticEmail);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new Supabase user for this Telegram account
      const { data: newUser, error } = await adminClient.auth.admin.createUser({
        email:          syntheticEmail,
        email_confirm:  true,
        user_metadata:  { telegram_id: telegramId, display_name: displayName, username },
      });

      if (error ?? !newUser?.user) {
        logger.error('Telegram auth: user creation failed', { error: error?.message });
        res.redirect('/login?error=signup_failed');
        return;
      }

      userId = newUser.user.id;

      // Insert user profile
      await adminClient.from('user_profiles').upsert({
        id:                userId,
        email:             syntheticEmail,
        display_name:      displayName,
        telegram_id:       parseInt(telegramId, 10),
        telegram_username: username,
        role:              syntheticEmail === config.ADMIN_EMAIL ? 'admin' : 'user',
      }, { onConflict: 'id' });

      logger.info('New user via Telegram', { displayName, username, telegramId });
    }

    // Generate a magic link that logs the user in
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type:  'magiclink',
      email: syntheticEmail,
    });

    if (linkError ?? !linkData?.properties?.action_link) {
      logger.error('Telegram auth: magic link generation failed', { error: linkError?.message });
      res.redirect('/login?error=session_failed');
      return;
    }

    // Redirect to the magic link — Supabase handles the session
    res.redirect(linkData.properties.action_link);
  } catch (err) {
    logger.error('Telegram auth callback error', { error: (err as Error).message });
    res.redirect('/login?error=server_error');
  }
});

// ─── POST /auth/provision — called after email signup to create user_profiles row

authRouter.post('/provision', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']?.replace('Bearer ', '');
    if (!authHeader) { res.status(401).json({ error: 'Unauthorized' }); return; }

    // Verify the token
    const anonClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    const { data: { user }, error } = await anonClient.auth.getUser(authHeader);
    if (error ?? !user) { res.status(401).json({ error: 'Invalid token' }); return; }

    const { display_name } = req.body as { display_name?: string };

    // Check if profile already exists
    const { data: existing } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      const isAdmin = user.email === config.ADMIN_EMAIL;
      await adminClient.from('user_profiles').insert({
        id:           user.id,
        email:        user.email,
        display_name: display_name ?? user.email?.split('@')[0] ?? 'User',
        role:         isAdmin ? 'admin' : 'user',
      });
      logger.info('User profile provisioned', { email: user.email, isAdmin });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Profile provision failed', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});
