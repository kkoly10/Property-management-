# Crecy document scan relay

The relay speaks HTTP to the Crecy document worker and keeps one ClamAV engine loaded locally. It requires Linux amd64, Python 3.11 or newer, and an official ClamAV signature database. The Dockerfile pins the publisher's ClamAV 1.4.7 image by digest and includes its bundled definitions. Refresh the image pin when security updates ship. [ClamAV 1.4.7 release](https://github.com/Cisco-Talos/clamav/releases/tag/clamav-1.4.7) · [Official image tags](https://hub.docker.com/r/clamav/clamav/tags)

## Configuration

| Variable | Value |
| --- | --- |
| `CRECY_DOCUMENT_SCAN_RELAY_SECRET` | Required. Use a unique URL-safe secret of 32–256 characters and set the same value in the Crecy worker. |
| `PORT` | Relay HTTP port, default `8080`. |
| `CLAMD_SOCKET` | Private Unix socket path, default `/tmp/crecy-clamd.sock`, mode `0600`. |
| `CLAMD_TCP_PORT` | Optional local native test port. Configure the test daemon and relay for the same port on `127.0.0.1`. Leave unset for normal operation. |

The image runs the HTTP relay, ClamD, and FreshClam as the unprivileged `clamav` user. Its Unix socket is local to the container. The image starts no milter or externally reachable ClamD listener. Publish only the HTTP port and terminate TLS at a restricted ingress. Configure the Crecy worker's `CRECY_DOCUMENT_SCAN_RELAY_URL` to the full HTTPS `/scan` URL after verification.

## HTTP contract

- `GET /health` returns 200 when ClamD reports a usable, loaded signature database. It returns 503 while the engine starts or cannot answer and when definitions are missing or more than three days old. It returns no document or definition metadata.
- `POST /scan` accepts a bearer-authenticated, raw `application/octet-stream` body of up to 50 MiB. Supply `Content-Length`, the lowercase SHA-256 in `x-crecy-sha256`, and the scan-job UUID in `Idempotency-Key`. A successful result contains a verdict and a reference derived from the job UUID. Oversize, checksum mismatch, engine or definition errors, and incomplete scans produce no clean verdict.
- The engine applies a 50 MiB per-file cap, a 160 MiB cumulative scan cap, and bounded archive nesting, item count, concurrency, and time. Limit and encryption alerts are enabled. Scan mail and URL phishing inspection are disabled. Bytes may be spooled in ClamD's private temporary directory during inspection. The relay sends no document bytes, filenames, or detection artifacts to an external service. FreshClam egress downloads definitions only. [ClamD 1.4.7 configuration](https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.7/etc/clamd.conf.sample)

FreshClam checks the official mirror hourly, verifies the signature database updates and load-tests them, then notifies ClamD to reload. ClamD also checks for local database changes periodically. Reloads may temporarily delay scans. The image skips concurrent engine reloads to reduce peak memory use. Keep the definition directory writable for the unprivileged daemon and monitor definition age and update failures. Use one updater per shared definition volume if you supply a volume. [Signature updates](https://docs.clamav.net/manual/Usage/SignatureManagement.html) · [ClamAV container memory and volumes](https://docs.clamav.net/manual/Installing/Docker.html)

## Local container check

Set `CRECY_DOCUMENT_SCAN_RELAY_SECRET` in the shell before launching the container.

```sh
docker build --platform linux/amd64 -t crecy-document-scanner:local .
docker run --rm --name crecy-document-scanner --memory 4g --cpus 1 \
  --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:8080:8080 -e CRECY_DOCUMENT_SCAN_RELAY_SECRET crecy-document-scanner:local
```

In another terminal, poll the readiness endpoint and note how long it takes to first return 200.

```sh
curl --fail-with-body http://127.0.0.1:8080/health
```

Run the relay tests from the repository root with `python -B -m unittest discover -s services/document-scanner`. All nine passed locally. In the Windows loopback integration, the existing Crecy adapter sent a nonbinding PDF and three concurrent 25 MiB synthetic uploads over test HTTPS to a real ClamD 1.4.7 engine using the official definitions. All four cleared. The engine took 10.6 seconds to load its definitions on that workstation.

Through the intended TLS ingress, test clean synthetic bytes, a synthetic detection fixture in a disposable test engine, an encrypted document, a digest mismatch, missing authorization, and the request size boundary. Verify a restart with cold definitions, and a definition update and engine reload with the service warm. Use fresh and warm measurements for 1 MiB, 25 MiB, and a 50 MiB boundary object where the ingress supports it. Record CPU, peak memory during update and reload, time to readiness, and transfer-plus-scan latency. The current relay budget is 10 seconds, inside the Crecy worker's 12-second relay call timeout. Docker was unavailable on the test host, so build the Linux image and measure cold start on the intended deployment platform.

## Hosting notes

Start benchmarking at 1 vCPU and 4 GiB with one concurrent request per instance. A Cloud Run instance with Python's HTTP/1 server accepts requests up to 32 MiB. The ordinary Crecy upload is capped at 25 MiB and is sent as a raw body, which fits that hop. The full 50 MiB relay limit requires a different ingress path with sufficient end-to-end limits. Cloud Run's HTTP/2 exception requires an HTTP/2-capable backend, which this image does not supply. Verify the sending worker's own transfer and response limits separately. [Cloud Run limits](https://cloud.google.com/run/quotas) · [Cloud Run end-to-end HTTP/2](https://cloud.google.com/run/docs/configuring/http2)

For a low-volume Cloud Run pilot, start with request-based billing, zero minimum instances, and a one-instance maximum. In the published lower-cost US-region tier, the request-based 360,000 GiB-second memory allowance corresponds to 25 billable hours at 4 GiB before shared free-tier use. A continuously warm request-based minimum of one at 1 vCPU and 4 GiB is roughly USD 32.40 for 30 idle days before discounts, requests, active compute, registry, and network charges. Request-based idle CPU does not guarantee background definition updates. Keep definitions current through refreshed image revisions and a verified startup update, or use an always-on instance with budgeted background CPU. Configure a startup probe to require a 200 from `/health` before sending traffic. Confirm the current region, pricing, and budget before provisioning. [Cloud Run pricing](https://cloud.google.com/run/pricing) · [Cloud Run billing and background execution](https://cloud.google.com/run/docs/configuring/billing-settings)
