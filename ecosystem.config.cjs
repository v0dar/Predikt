// PM2 process manager config for Predikt VPS deployment.
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'predikt',
      script: './dist/index.js',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',

      // Restart policy
      autorestart:      true,
      watch:            false,
      max_restarts:     10,
      restart_delay:    5000,   // 5s between restarts
      min_uptime:       '10s',  // must stay up 10s to count as successful start

      // Memory limit — restart if RSS > 512 MB
      max_memory_restart: '512M',

      // Logging
      out_file:   './logs/predikt-out.log',
      error_file: './logs/predikt-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Environment (production)
      env_production: {
        NODE_ENV:  'production',
        LOG_LEVEL: 'info',
      },

      // Environment (staging / dry-run test)
      env_staging: {
        NODE_ENV:  'production',
        LOG_LEVEL: 'debug',
      },
    },
  ],
};
