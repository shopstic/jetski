import { AgentInstanceConfig } from "../../src/types.ts";
import agentInstanceConfig from "./multi-2.ts";

export default {
  ...agentInstanceConfig,
  name: "jetski-multi-node-6",
  nodeLabels: {
    "com.jetski/foo": "something",
    "com.jetski/baz": "else",
  },
} satisfies AgentInstanceConfig;
