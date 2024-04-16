import type { AgentInstanceConfig } from "../../src/types.ts";
import agentInstanceConfig from "./multi-4.ts";

export default {
  ...agentInstanceConfig,
  name: "jetski-multi-node-5",
  nodeLabels: {
    "com.jetski/foo": "something",
    "com.jetski/baz": "else",
  },
} satisfies AgentInstanceConfig;
