/**
 * BFF service entry point.
 */

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[luban-bff] listening on :${config.port} | ms=${config.msUpstream} hub=${config.hubUpstream} auth=${config.authUrl}`,
  );
});
