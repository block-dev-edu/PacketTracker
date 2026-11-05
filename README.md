# PacketTracker

A browser-based network design workspace inspired by Cisco Packet Tracer. The current prototype includes a device library, drag-and-drop canvas, device positioning, local persistence, zoom controls, and JSON export.

## Run locally

```bash
npm install
npm run dev
```

The server scans ports `3000` through `3010` and prints the first available URL.

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

- `server.mjs` — Express server, health endpoint, Vite middleware in development
- `src/main.jsx` — React application and device catalog
- `src/styles.css` — responsive editor UI
- Browser local storage currently stands in for future account-backed saved designs

The placed-device model uses stable instance IDs and serializable JSON so it can later move to an authenticated API and support rubric-based autograding.

## Simulation core

The simulation core in `src/simulation/` models physical ports, Layer 2 broadcast
domains, routed interfaces, connected routes, DHCP leases, source NAT, stateful
return traffic, and ordered stateless ACL rules. Run its behavioral tests with:

```bash
npm test
```
