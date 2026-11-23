/**
 * BFF service entry point.
 */

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);

if (config.sessionTokenViaQuery === 'allow') {
  // G1 B5a: make any compatibility window loudly visible in the service log.
  // eslint-disable-next-line no-console
  console.warn(
    '[luban-bff] WARNING: SESSION_TOKEN_VIA_QUERY=allow — query-string tokens are accepted '
      + '(rollback window only, registered as EXCEPTIONS X-18; restore deny before expiry)',
  );
}

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[luban-bff] listening on :${config.port} | ms=${config.msUpstream} hub=${config.hubUpstream} auth=${config.authUrl}`,
  );
});
