#!/bin/bash
# Install official iTwin SDK packages

echo "Installing iTwin Platform SDKs..."

# Auth client
npm install @itwin/browser-authorization@^1.0.0

# iModels authoring client
npm install @itwin/imodels-client-authoring@^6.0.2

# Access control client
npm install @itwin/access-control-client@^3.0.0

# Webhooks client
npm install @itwin/webhooks-client@^1.0.0

# Web viewer
npm install @itwin/web-viewer-react@^5.0.0

echo "Done!"
