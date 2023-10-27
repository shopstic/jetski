import { ServerInstanceConfig } from "../../src/types.ts";
import serverInstanceConfig from "./multi-1.ts";

export default {
  ...serverInstanceConfig,
  clusterInit: false,
  name: "jetski-multi-node-2",
  keepalived: {
    ...serverInstanceConfig.keepalived,
    state: "BACKUP",
    priority: 254,
  },
} satisfies ServerInstanceConfig;
