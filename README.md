# PacketTracker

A browser-based, classroom-oriented network design workspace inspired by Cisco Packet Tracer. PacketTracker includes teacher and student accounts, teacher-owned classes with join codes, profile-backed projects, project sharing, a drag-and-drop topology editor, and a vendor-neutral network simulation.

## Run locally

```bash
npm install
npm run dev
```

The server scans ports `3000` through `3010` and prints the first available URL.

On first launch, register a teacher account. Create a class from the teacher dashboard and give its join code to students. Students select the student role during registration and enter that code.

Application data is stored in `data/packettracker.db` by default. Set `PACKETTRACKER_DB` to use another SQLite path. The `data/` directory is intentionally excluded from Git.

## Cloudflare Tunnel

Vite accepts Cloudflare Quick Tunnel hostnames and the Node server listens on all
network interfaces. Start the app, note the selected port, then point Cloudflare
at that local origin:

```bash
npm run dev
cloudflared tunnel --url http://localhost:3000
```

If port `3000` was occupied, replace it with the port printed by PacketTracker.
For a named tunnel on a custom domain, add that domain to `server.allowedHosts`
and `preview.allowedHosts` in `vite.config.js`.

For production mode:

```bash
npm run start
```

`npm run start` automatically builds the Vite bundle before starting the Express server.

## Architecture

- `server.mjs` — Express server, platform API, and Vite middleware in development
- `src/server/platform.mjs` — accounts, sessions, classes, enrollments, projects, and sharing
- `src/main.jsx` — React application and device catalog
- `src/styles.css` — responsive editor UI
- SQLite stores account-backed projects; local storage remains a recovery cache and stores UI preferences

Classes and projects are teacher/user scoped from the start, so the deployment can support multiple independent teachers even if it initially has only one. The project document remains serializable JSON so snapshots, assignments, rubric-based grading, and PostgreSQL migration can be added later.

## Simulation core

The simulation core in `src/simulation/` models physical ports, Layer 2 broadcast
domains, routed interfaces, connected routes, DHCP leases, source NAT, stateful
return traffic, and ordered stateless ACL rules. Run its behavioral tests with:

```bash
npm test
```
