import type { Bot } from 'grammy';
import type { BotContext } from '../types/index.js';
import { requireRole } from '../middlewares/auth.js';

import { startCommand }                                     from './start.js';
import { helpCommand }                                      from './help.js';
import { statusCommand }                                    from './status.js';
import { healthCommand }                                    from './health.js';
import { modeCommand }                                      from './mode.js';
import { signalsCommand }                                   from './signals.js';
import { positionsCommand }                                 from './positions.js';
import { portfolioCommand }                                 from './portfolio.js';
import { tradesCommand }                                    from './trades.js';
import { riskCommand }                                      from './risk.js';
import { pauseCommand }                                     from './pause.js';
import { resumeCommand }                                    from './resume.js';
import { emergencyStopCommand, handleEmergencyStopCallback } from './emergency-stop.js';
import { configCommand }                                    from './config.js';
import { diagnoseCommand }                                  from './diagnose.js';
import { recoverCommand }                                   from './recover.js';
import { marketsCommand }                                   from './markets.js';
import { ordersCommand }                                    from './orders.js';
import { strategiesCommand }                                from './strategies.js';
import { performanceCommand }                               from './performance.js';
import { alertsCommand }                                    from './alerts.js';
import { queuesCommand }                                    from './queues.js';
import { logsCommand }                                      from './logs.js';
import { scanCommand }                                      from './scan.js';

export function registerCommands(bot: Bot<BotContext>): void {
  // ─── Viewer commands (all authenticated roles) ──────────────────────────
  bot.command('start',       startCommand);
  bot.command('help',        helpCommand);
  bot.command('status',      statusCommand);
  bot.command('health',      healthCommand);
  bot.command('mode',        modeCommand);
  bot.command('config',      configCommand);
  bot.command('markets',     marketsCommand);
  bot.command('market',      marketsCommand);
  bot.command('signals',     signalsCommand);
  bot.command('signal',      signalsCommand);
  bot.command('positions',   positionsCommand);
  bot.command('position',    positionsCommand);
  bot.command('orders',      ordersCommand);
  bot.command('order',       ordersCommand);
  bot.command('portfolio',   portfolioCommand);
  bot.command('trades',      tradesCommand);
  bot.command('performance', performanceCommand);
  bot.command('risk',        riskCommand);
  bot.command('alerts',      alertsCommand);
  bot.command('logs',        logsCommand);
  bot.command('queues',      queuesCommand);
  bot.command('strategies',  strategiesCommand);

  // ─── Admin commands ─────────────────────────────────────────────────────
  bot.command('scan',     requireRole('ADMIN', 'OWNER'), scanCommand);
  bot.command('diagnose', requireRole('ADMIN', 'OWNER'), diagnoseCommand);
  bot.command('pause',    requireRole('ADMIN', 'OWNER'), pauseCommand);
  bot.command('resume',   requireRole('ADMIN', 'OWNER'), resumeCommand);

  // ─── Owner commands ─────────────────────────────────────────────────────
  bot.command('recover',        requireRole('OWNER'), recoverCommand);
  bot.command('emergency_stop', requireRole('OWNER'), emergencyStopCommand);

  // ─── Inline keyboard callbacks ──────────────────────────────────────────
  bot.callbackQuery(/^estop:/, requireRole('OWNER'), handleEmergencyStopCallback);
}
