// PM2 process definition — keeps the backend alive 24/7 and restarts on crash.
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup   # survive VPS reboots
module.exports = {
  apps: [
    {
      name: 'nexus-agent',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
