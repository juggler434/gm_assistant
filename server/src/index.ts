import { config } from "@/config/index.js";

function main() {
  console.log(`Starting ${config.appName} v${config.version}`);
  console.log(`Environment: ${config.env}`);
  console.log(`Server will run on port ${config.port}`);
}

main();
