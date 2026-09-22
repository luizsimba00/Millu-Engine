import { app } from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', event: 'server_started', port: config.port, mode: config.simulateOlist ? 'simulation' : 'olist-live' }));
});
