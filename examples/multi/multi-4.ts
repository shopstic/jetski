import type { AgentInstanceConfig } from "../../src/types.ts";
import serverInstanceConfig from "./multi-3.ts";

export default {
  ...serverInstanceConfig,
  role: "agent",
  name: "jetski-multi-node-4",
  nodeLabels: {
    "com.jetski/foo": "something",
    "com.jetski/baz": "else",
  },
} satisfies AgentInstanceConfig;
