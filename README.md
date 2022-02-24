# Jetski - the nimble local Kubernetes development environment

`jetski` is a CLI tool built on top of [multipass](https://github.com/canonical/multipass) and [k3s](https://github.com/k3s-io/k3s) to create an ideal local Kubernetes development experience. 

It embraces Infrastructure as Code practice and allows you to manage multiple local Kubernetes instances via their own type-safe config files. On top of that, it manages local routes and DNS rules such that you can access Kubernetes `Services` and/or `Pods` directly via their respective [DNS names](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#services), `Service IPs` or `ClusterIPs` from all your local tools. It's "magical", and once you have tried it, there's no going back.

## License

[Apache 2.0 License](./LICENSE)

## Getting started

First, install [multipass](https://github.com/canonical/multipass) on your local development computer.

Then obtain `jetski` in your [Nix shell](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-develop.html). You can simply add it as a Nix flake input to your existing `flake.nix`. For example:

```nix
{
  # ...

  inputs = {
    # ...
    jetski.url = "github:shopstic/jetski";
  };

  outputs = { self, nixpkgs, flakeUtils, /* ... ,*/ jetski }:
    flakeUtils.lib.eachDefaultSystem
      (system:
        let
          jetskiBin = jetski.defaultPackage.${system};
        in
        {
          devShell = pkgs.mkShellNoCC rec {
            buildInputs = [
              jetskiBin
            ];
          };
        }
      );
}
```

## Usage

Create a config file that describe a local Kubernetes instance, for example:

```typescript
import type { InstanceConfig } from "https://deno.land/x/jetski@1.0.0/types.ts";

const config: InstanceConfig = {
  name: "local",
  image: "focal",
  cpus: 1,
  memoryGiBs: 1,
  diskGiBs: 4,
  k3sVersion: "v1.21.9+k3s1",
  clusterCidr: "10.254.254.0/24",
  serviceCidr: "10.254.255.0/24",
  clusterDnsIp: "10.254.255.10",
  clusterDomain: "jetski.local",
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  sshDirectoryPath: "./local/.ssh",
};

export default config;
```

Then simply launch it via a single command:

```bash
jetski --config /path/to/instance-config.ts create
```

To see the complete list of all supported commands, run `jetski` with no arguments. The currently supported commands are:

- `version`: Output the current `jetski` version in JSON
- `ssh`: SSH into an instance's VM
- `create`: Create a new instance
- `stop`: Shutdown an instance's VM
- `destroy`: Destroy an instance
- `start`: Start a previously stopped instance
- `reset`: A convenient command to `destroy` then `create` the instance again