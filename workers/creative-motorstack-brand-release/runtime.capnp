using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "creative", worker = (
      modules = [
        (name = "worker.js", esModule = embed "dist/worker.js"),
        (name = "brand-rpc.mjs", esModule = embed "dist/brand-rpc.mjs")
      ],
      bindings = [
        (name = "MOTORSTACK_API_KEY", text = "msk_test_fixture_only_0123456789"),
        (name = "ASSETS", service = "provider"),
        (name = "CREATIVE_AUTH_KEY", text = "fixture-only")
      ],
      globalOutbound = "provider"
    )),
    (name = "provider", worker = (
      modules = [(name = "provider.mjs", esModule = embed "runtime-provider.mjs")]
    )),
    (name = "test", worker = (
      modules = [(name = "test.mjs", esModule = embed "runtime-test.mjs")],
      bindings = [(name = "MOTORSTACK_BRAND_ASSETS", service = (name = "creative", entrypoint = "MotorstackBrandAssets"))]
    ))
  ]
);
