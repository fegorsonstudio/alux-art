module.exports = {
  apps: [
    {
      name: "aluxart",
      script: "node_modules/.bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      kill_timeout: 5000,
      env: { NODE_ENV: "production", PORT: "3000" },
    },
  ],
};
