# Native canary registry transport review

27 October 2026. Read-only diagnosis; only this report was written.

## Decision

**Publication remains blocked. No Cloudflare registry configuration error or proven EOF fix was found.** The supported publication route is already being used. There is one concrete transport limitation worth correcting before considering another attempt: the active Docker Engine 29.2.0 containerd image-store path does not enforce upload concurrency limits. An Engine release containing Moby's concurrency fix, with `max-concurrent-uploads: 1`, would provide a materially different, supported transport test. That is a hypothesis-driven test, not an established cure for these EOFs.

Do not run a third unchanged push. Do not rebuild, switch image stores, deploy, or consume the hosted native invocation to diagnose publication. Docker installation/configuration changes were not performed and are outside this worker's read-only assignment.

## Facts and evidence

The authorization and acceptance boundary comes from [CLOUD-CANARY-RELEASE-DECISION.md](CLOUD-CANARY-RELEASE-DECISION.md) and [CLOUD-CANARY-ATTESTATION.md](CLOUD-CANARY-ATTESTATION.md): publish only the retained artifact, independently verify the registry identity, and satisfy the separate deployment/admission gates afterward.

| Item | Observed evidence |
| --- | --- |
| Retained image | Local OCI manifest `sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472`; config `sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805` |
| Qualified tag | `banner-engine-native-canary:qualified-20261027-12158e33` |
| Target | `registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/banner-engine-native-canary:qualified-20261027-12158e33` |
| First push | `/private/tmp/banner-canary-registry-push.log`: login succeeded; 13 distinct layers reported pushed, one already existing; blob-commit PUT failed with EOF; Docker exit 1 |
| Retry | `/private/tmp/banner-canary-registry-push-retry.log`: login succeeded; 15 distinct layers already existing, zero reported pushed; different blob-commit PUT failed with EOF; Docker exit 1 |
| First failed blob | `sha256:a03ce8e2700f1129dc15f38a5e1e7d27cdd2b98175c4d9ac08dc5646c3c35ba4`; attested layer 1, compressed size 8,399,638 bytes |
| Retry failed blob | `sha256:589002ba0eaed121a1dbf42f6648f29e5be55d5c8a6ee0f8eaa0285cc21ac153`; attested layer 0, compressed size 3,861,821 bytes |
| Registry readback | Existing `/private/tmp/banner-canary-registry-readback.json` contains `[]`; no fresh registry request was made by this review |
| Registry config | `/private/tmp/banner-canary-registry-config.json`: correct account above, name `banner-engine-native-canary`, compatibility date `2026-10-27`, `workers_dev: false`, `preview_urls: false`, `routes: []`; no credential fields or Dockerfile/container build configuration |
| Installed uploader | Wrangler 4.110.0; `/usr/local/bin/docker`; Docker client/server 29.2.0; Docker Desktop context `desktop-linux`; driver `overlayfs`, driver type `io.containerd.snapshotter.v1` |

Read-only inspection by immutable ID confirmed Linux AMD64 and both qualified local and fully qualified registry tags pointing to the retained local image. One initial tag lookup returned `No such image`; subsequent immutable-ID inspection, image listing, and an explicit `--context desktop-linux` tag inspection succeeded. No retag or state change was performed by this reviewer. This transient lookup is unexplained and is another reason to fail closed on a fresh identity check before publication; it does not explain the earlier registry EOFs.

The 15 existing layers include `effa5c3a383e`, which was not among the first log's 13 reported pushed layers plus its one existing layer. This is consistent with concurrent partial completion outliving the first reported failure. It does not prove an image manifest was published. The small sizes of the two failed blobs do not support blaming the historical outer-build byte-budget breach or a demonstrated per-layer size limit.

No HTTP response status, provider request ID, or daemon network trace accompanies the EOF. Successful login and partial blob transfer make a blanket account/authentication failure less likely; they do not establish that every later request was authorized or accepted.

### Installed Wrangler source trace

Inspected `node_modules/wrangler/wrangler-dist/cli.js`, SHA-256 `64e547d8912121a116f8109eacd3c4061e61499de32eb994df5ae62f2eb905dd`:

- Lines 127213–127248: `dockerLoginImageRegistry` requests fresh credentials with 15-minute validity and push/pull permission, then invokes Docker login with the password on stdin.
- Lines 127264–127279 and 127399 onward: registry defaults to `registry.cloudflare.com`, and unqualified tags acquire the selected account namespace. Both logs show the expected resulting repository.
- Lines 200703–200721: `pushCommand` logs in, checks Linux AMD64, tags the existing image, then spawns `docker push`. It does not build or run the image.
- Lines 126969 onward: `runDockerCmd` delegates to the child process and propagates its exit code. No HTTP upload timeout, layer concurrency, or registry retry setting is applied here.
- Lines 200906–200935: the push command exposes the tag and `--path-to-docker`; there is no push-specific concurrency or TTL flag.
- Lines 202615 onward: image listing removes repositories with no remaining tags and normally filters digest-like tags. Therefore `[]` is not proof that uploaded blobs are absent. The listing path also generates registry credentials, so it was not rerun under this review's no-auth constraint.

The [official Cloudflare image-management guide](https://developers.cloudflare.com/containers/guides/image-management/#push-images-to-the-cloudflare-registry) supports pushing an existing local image with `wrangler containers push`. The [command reference](https://developers.cloudflare.com/workers/wrangler/commands/containers/#push) agrees with the installed push arguments. No supported Cloudflare endpoint, compatibility-date, account-path, or upload-concurrency correction was identified. Changing external-registry configuration would not repair this managed-registry upload path.

## Supported transport change versus hypotheses

**Verified limitation:** the exact [Moby Docker 29.2.0 source](https://github.com/moby/moby/blob/docker-v29.2.0/daemon/containerd/image_push.go#L133) creates a nil limiter, with a TODO to respect concurrent transfer settings, and passes it into `remotes.PushContent`. Consequently, adding `max-concurrent-uploads: 1` to this installed daemon alone is not an effective serialized-push test.

[Moby PR 53081](https://github.com/moby/moby/pull/53081) implements the missing limiter, and [Docker Engine 29.7.0 release notes](https://docs.docker.com/engine/release-notes/29/#2970) record the fix. [Docker's push documentation](https://docs.docker.com/reference/cli/docker/image/push/#concurrent-uploads) recommends lowering daemon upload concurrency for constrained links. A supported later Docker Desktop/Engine containing that fix, retaining the existing containerd store and artifact, can make `max-concurrent-uploads: 1` meaningful. Do not install 29.7.0 blindly: select a maintained compatible release and review its regressions before a coordinated host change.

**Unproved cause:** excessive simultaneous uploads might stress the network/proxy/registry and produce EOF, but these logs do not demonstrate that causal chain. A registry-side interruption, proxy/VPN/TLS intermediary, or Docker/containerd transport fault remains possible. Different failed blob commits and partial reuse fit these explanations without distinguishing them.

**Not supported by current evidence:** expired credentials, a bad image platform, oversized failed layers, malformed namespace, or manifest-media-type rejection. The failure occurs at blob commit, and no manifest validation error is present. A Wrangler upgrade alone has no demonstrated connection to the failure. Increasing a Node timeout, changing the application compatibility date, disabling TLS validation, or rebuilding is not an evidenced remedy.

Switching Docker Desktop to its classic image store is not a safe shortcut: [Docker documents separate stores and temporarily hidden images after switching](https://docs.docker.com/desktop/features/containerd/#switch-image-stores). Preserve the exact retained OCI bytes and store. Do not re-import or recompress through an alternative tool without separately proving manifest/config/layer identity.

## Concrete safe next command

For a credential-free baseline only, the coordinator can run the following bounded request. It ignores curl's startup file, bypasses configured proxies, sends no registry credentials, and prints only status/timings. It was **not executed** in this review.

```sh
curl -q --noproxy '*' --connect-timeout 10 --max-time 20 \
  --silent --show-error --output /dev/null \
  --write-out 'http=%{http_code} tls=%{time_appconnect} total=%{time_total}\n' \
  https://registry.cloudflare.com/v2/
```

A 401 is a normal possible unauthenticated registry response; any completed HTTP response establishes only host-side connectivity. A curl success cannot validate Docker Desktop VM routing, authenticated blob uploads, or registry publication. Failure can guide investigation of DNS/TLS/direct egress before any upload attempt.

Before a future changed-transport test, record the selected Engine version, effective concurrency configuration, Docker context, and a fresh identity check:

```sh
docker --context desktop-linux version --format '{{.Server.Version}}'
docker --context desktop-linux image inspect \
  --format '{{.Id}} {{.Os}}/{{.Architecture}}' \
  banner-engine-native-canary:qualified-20261027-12158e33
```

Require the exact retained ID above and `linux/amd64`. If the coordinator has completed and verified a meaningful transport correction, this remains the existing-artifact publication command, **not a command to run unchanged now**:

```sh
DOCKER_CONTEXT=desktop-linux pnpm exec wrangler containers push \
  banner-engine-native-canary:qualified-20261027-12158e33 \
  --config /private/tmp/banner-canary-registry-config.json \
  --path-to-docker /usr/local/bin/docker
```

This command internally performs authentication and remote writes. It was not executed, nor was any manual login performed. Keep one bounded attempt and retain a sanitized receipt; do not automatically retry it. Existing publication authorization does not establish that a host-wide Docker upgrade/restart is within this worker's scope.

## Evidence still required

1. Sanitized daemon-side network/error evidence for the existing upload windows, including request timing and any HTTP status/provider correlation IDs, or a provider-side diagnosis. Preserve upload IDs locally; redact upload-state query strings, authorization headers, credentials, and unrelated payloads before sharing. No external support message was sent.
2. Evidence that a selected transport correction actually affects Docker's push path. For serialized transfer, verify a fixed Engine and effective daemon setting; a shell proxy variable or edited setting alone is insufficient.
3. After any successful publication, independently read back the remote manifest/config and correlate all layer descriptors with the retained attestation. Record the registry digest separately. Local tags and local RepoDigests are not remote publication receipts.
4. Separate deployment, private status, once-only invocation, destruction, and admission-disable evidence. None is supplied here. The release ledger still records no hosted native invocation consumed.

## Review provenance and limits

Existing log SHA-256 values:

- First push: `681e1623376a5cb334cbc5fcab8247c358f18ed9f7cfe0c6235419924dd94bd5`.
- Retry: `f8dd7a40ad6f2d8d83f909b4a2dccedc4e604ca9a538bd6cda377a6268e92288`.
- Registry config: `724224cfed88082fd57b6f1ef54f5376f623c82f4259f338177384c9d1fd2b2f`.
- Existing image-list receipt: `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`.

Official sources were consulted on 27 October 2026. This dirty checkout is `adme-dev/banner-editable-artwork` at `47ec30c3522f6ab660d730776709770c8a22d7c8`, with no upstream; cached `origin/main` is `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958` (1 local-only / 11 main-only commits). No fetch or branch mutation was performed for this read-only assignment, and this checkout is not asserted to be the release candidate.

Verification consisted of existing receipt/log parsing and hashing, installed-source inspection, official documentation/source comparison, and allowlisted local Docker metadata reads. No application tests were needed for this documentation-only change. No build, native/container run, push, deployment, registry mutation, credential-file read, login, configuration change, or invocation occurred.
