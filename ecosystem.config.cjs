module.exports = {
  apps: [
    {
      name: "aluxart",
      script: "node_modules/.bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      // 512M was killing the app mid-generation (brief building peaks ~600MB),
      // leaving shoots stuck in QUEUED forever. Server has 3.8G total.
      max_memory_restart: "2G",
      kill_timeout: 5000,
      env: { NODE_ENV: "production", PORT: "3000" },
    },
  ],
};
