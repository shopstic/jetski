import { bold, CliProgram, NonZeroExitError, red } from "./deps.ts";
import version from "./actions/version.ts";
import ssh from "./actions/ssh.ts";
import create from "./actions/create.ts";
import stop from "./actions/stop.ts";
import suspend from "./actions/suspend.ts";
import start from "./actions/start.ts";
import destroy from "./actions/destroy.ts";
import reset from "./actions/reset.ts";
import refresh from "./actions/refresh.ts";

const program = new CliProgram()
  .addAction("version", version)
  .addAction("ssh", ssh)
  .addAction("create", create)
  .addAction("stop", stop)
  .addAction("suspend", suspend)
  .addAction("destroy", destroy)
  .addAction("start", start)
  .addAction("reset", reset)
  .addAction("refresh", refresh);

try {
  await program.run(Deno.args);
} catch (e) {
  if (e instanceof NonZeroExitError) {
    console.error(bold(red("[Error]")), JSON.stringify(e, null, 2));
    Deno.exit(1);
  } else if (Deno.env.get("JETSKI_ENABLE_STACKTRACE") !== "0") {
    throw e;
  } else {
    console.error(bold(red("[Error]")), e.message);
    Deno.exit(1);
  }
}
