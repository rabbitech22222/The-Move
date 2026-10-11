# Cloud task startup

Use the existing `/workspace/The-Move` checkout. Do not create a worktree or reset local work. Installation is `bash scripts/cloud-install.sh`; it preserves `.env` and demo edits. The checked-in environment example contains no private API credentials.

Long-running processes do not survive environment publication. Restart them for each task. First check `/api/health` and the existing `.move-runtime` PID/log files; reuse a healthy application and matching worker. Do not launch duplicate processes. Stop only verified processes for this checkout, never broad `pkill node` commands.

For the default labeled demo, start from the checkout:

```sh
cd /workspace/The-Move
docker compose up -d postgres redis
mkdir -p .move-runtime
nohup npm run dev < /dev/null > .move-runtime/web.log 2>&1 &
echo $! > .move-runtime/web.pid
nohup npm run worker < /dev/null > .move-runtime/worker.log 2>&1 &
echo $! > .move-runtime/worker.pid
```

The logs and PID files are ignored by Git and Docker. For PostgreSQL mode, initialize a separate non-demo database with `npm run db:migrate` and `npm run db:seed` before starting; distinct operator passwords must already be configured. Never convert the demo workspace into production or share its Redis queue with a live workspace.

Check `/api/health`, sign in through `/api/auth`, then verify `/api/workspace` and Dashboard/Studio/Office. The public demo credentials are `operator1@themove.local` or `operator2@themove.local`, password `move-demo-2026`. These apply only in demo mode. `npm run test:queue` confirms real deduplication and weekly-report task lifecycles with the configured demo worker. A process ID or a queue acknowledgment alone does not prove readiness.

When behind the cloud egress proxy, preserve the platform's proxy and trusted CA variables; never disable TLS verification. Trusted source-proxy fallback requires exact source hosts in `SOURCE_PROXY_ALLOWED_HOSTS`; the verified GitHub Atom feed uses `github.com`. Arbitrary source hosts require administrator review and matching network access. OpenAI, Canva and Meta need optional credentials/authorization before use and separate provider E2E validation. Disconnected states are expected without those credentials.

Saving the environment draft does not apply it. Review and save in environment settings, then publish to retain this installed filesystem. Restoration in a fresh task has not been independently verified.
