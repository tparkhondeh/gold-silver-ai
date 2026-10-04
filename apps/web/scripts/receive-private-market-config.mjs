// Deliberate operator entry; never invoked by startup, an HTTP route or a test
// against a real credential. Owner transfer approval must be recorded first.
import { runPrivateMarketReceiveCommand } from "./private-market-receive-command.ts";
import { receivePrivateMarketConfig } from "./private-market-config-receiver.ts";
import { readPrivateServerConfig } from "./private-server-config.ts";

try {
  const result = await runPrivateMarketReceiveCommand({
    args: process.argv.slice(2), execArgs: process.execArgv, environment: process.env, platform: process.platform,
    uid: process.getuid?.(), input: process.stdin,
    readConfiguration: readPrivateServerConfig, receive: receivePrivateMarketConfig,
  });
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  process.exitCode = result.exitCode;
} catch {
  process.stderr.write("Private provider delivery failed; contents withheld.\n");
  process.exitCode = 1;
}
