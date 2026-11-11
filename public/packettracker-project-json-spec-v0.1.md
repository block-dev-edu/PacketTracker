# PacketTracker Project JSON — Draft Contract v0.1

**Status:** The architecture/reachability subset documented below is implemented. Later sections describe the broader direction and remain proposals unless included in the implemented subset.

## Implemented v0.1 subset

The first importer intentionally supports architecture and reachability assignments only:

- Endpoint role types: `pc`, `laptop`, `server`, and `ip-phone`.
- Exact role counts with one assignment role per placed endpoint.
- `relationships` at `layer: "l2"` or `layer: "l3"`.
- Layer 3 currently uses deterministic ICMP reachability only (`protocol: "icmp"`).
- `allow` and `deny` are directional and evaluated for every assigned source/destination pair.
- Constraint type `separate_l2_domains`.
- Unsupported services, Internet rules, protocols, device types, and constraint types cause import validation errors.

Role assignment is assessment metadata only. In an assignment project, a student right-clicks a compatible endpoint and chooses **Assign role**.

### Assignment lifecycle

- Creating/importing an assignment adds it to the teacher's private assignment library; it does not publish it.
- A teacher may open a private preview project and exercise the same role binding and live evaluation students will use.
- An assignment may be published to zero, one, or many classes.
- Removing every class returns the assignment to private draft status without deleting the assignment or preview project.
- Each student has one current project for an assignment. Opening or starting it again returns that same project rather than creating attempt history.

## Goal

Teachers describe an assignment to an external AI using a supplied context prompt, obtain JSON, and import it into PacketTracker. **No AI is involved in evaluation or grading.** The application validates the JSON, binds student-created devices to scenario roles, and deterministically evaluates each requirement against the student's actual network configuration and behavior, continuously during development and again at submission.

## Top-level structure

```json
{
  "schemaVersion": "0.1",
  "scenario": {},
  "roles": [],
  "services": [],
  "segmentation": [],
  "relationships": [],
  "internet": {},
  "constraints": [],
  "grading": {}
}
```

### 1. `scenario`
- `id`: stable project identifier.
- `title`: human-readable title.
- `description`: student-facing narrative.
- `objectives`: optional student-facing learning goals.

### 2. `roles`
Each role is a logical group (department, endpoint class, guest clients, public servers), independent of device name, IP, or topology.
- `id`: unique identifier used by other requirements.
- `name`: display name.
- `deviceType`: supported endpoint category (must be validated against the application's device catalog).
- `count`: number of required devices in this role.

**Binding:** Students explicitly assign a role to each placed endpoint. Role assignment is only assessment metadata: it must not configure the endpoint, VLAN, IP address, or permissions. Evaluators check all assigned devices, not a sample. Additional devices and mixed device types need a defined policy before implementation.

### 3. `services`
Defines *functional services*, not merely device presence.
- `id`: unique service requirement identifier.
- `type`: supported service, e.g. `http`, `https`, `dns`, `dhcp`, `email` (only those actually simulated and testable may be accepted).
- `hostRole`: role containing the serving endpoint, when applicable.
- `clientRoles`: roles that must successfully use the service, when applicable.
- `accessibleFrom`: source role IDs or `internet` for a public service.

For each service, define deterministic success criteria (enabled/configured, routable, responds appropriately). Unsupported services must fail import validation rather than be silently graded as successful.

### 4. `segmentation`
Defines which role groups must be separate at Layer 2, independently of whether routing between them is permitted.
- `roles`: list of two or more role IDs that must occupy distinct L2 broadcast domains.
- `method`: `any` (actual L2 separation), `vlan` (separation specifically by VLAN), or `physical` (separate physical L2 infrastructure). Only implement methods that can be verified accurately.

Different IP subnets alone **do not** prove Layer 2 separation. A segmented network can still allow controlled inter-segment communication.

### 5. `relationships`
Explicit **directional** traffic policy between roles. This is the core grading contract.
- `from`: source role ID.
- `to`: destination role ID.
- `action`: `allow` or `deny` for **newly initiated** traffic.
- `service`: a supported testable service/protocol selector (e.g. `https`), or a precisely documented `any` test profile.

For each relationship, test **every assigned source device against every assigned destination device** (Cartesian product). Example: 2 guests × 4 managers = 8 source→destination checks. Reverse direction is a *different* requirement and must be explicit; `allow` does not imply reverse initiation is allowed. Responses to established connections are not equivalent to new inbound connections.

**No implicit policy:** An omitted pair means **unspecified/not graded**, not automatically allowed or denied. The teacher's AI prompt should be instructed to enumerate all desired directional relationships. Reject contradictory rules with overlapping scopes rather than guessing precedence.

### 6. `internet`
Separate Internet permissions from internal role-to-role relationships:
- `outbound`: role-to-Internet rules (which roles can initiate connections out, with service selectors).
- `inbound`: Internet-to-role rules (which roles/services can be reached by unsolicited inbound connections).

The simulator needs a defined Internet test endpoint and supported services; outbound tests must account for routing, NAT where applicable, security policy, and response path. Inbound tests must verify destination mapping/public reachability, not merely a server's listening port. **Established return traffic is not an unsolicited inbound connection.**

### 7. `constraints`
Optional implementation-specific requirements (when a teacher is assessing a technology rather than just an outcome):
- `type`: allowlisted evaluator name, e.g. `minimum_vlan_count`, `role_vlan`, `nat_required`, `firewall_required`, `device_type_required`.
- Other fields are **type-specific** and must be specified by a versioned registry/schema before enabling the constraint.

Examples: at least three operational VLANs; guest role must be on VLAN 30; NAT must be configured and functional. Avoid accepting vague types such as `secure_network`.

### 8. `grading`
Proposed project-wide defaults:
- `requireAllDevices`: true (every assigned required endpoint must satisfy applicable checks).
- `allowExtraDevices`: true (define how extras participate in security checks before shipping).
- `showLiveProgress`: true.
- `showFailureReasons`: true.

Point values may be attached to individual requirements later; define aggregation, partial credit, and dependency handling explicitly. **A denied flow caused solely by a disconnected or nonfunctional device should not count as proof of security.** Negative checks should be paired with positive operational requirements and should report `not_evaluable` when endpoints/path prerequisites are absent.

## Importable architecture example

The following example uses the supported v0.1 subset.

```json
{
  "schemaVersion": "0.1",
  "scenario": {
    "id": "coffee-shop",
    "title": "Coffee Shop Network",
    "description": "Build a segmented network for management and payment devices."
  },
  "roles": [
    {"id": "management", "name": "Managers", "deviceTypes": ["pc", "laptop"], "count": 2},
    {"id": "payments", "name": "Payment Terminals", "deviceTypes": ["pc"], "count": 2}
  ],
  "relationships": [
    {"id": "management-to-payments", "from": "management", "to": "payments", "action": "allow", "layer": "l3", "protocol": "icmp"},
    {"id": "payments-to-management", "from": "payments", "to": "management", "action": "deny", "layer": "l3", "protocol": "icmp"}
  ],
  "constraints": [
    {"id": "department-separation", "type": "separate_l2_domains", "roles": ["management", "payments"]}
  ],
  "settings": {
    "allowExtraDevices": true,
    "showLiveProgress": true,
    "showFailureReasons": true
  }
}
```

Layer 3 deny checks pass only when the packet is explicitly blocked by the simulated firewall. Missing routes, addressing, or connections produce `not_evaluable`, because a broken network does not prove a working security policy.

## Deterministic evaluation contract

1. **Import validation:** Parse JSON; validate schema version, allowed types, role references, cardinality, contradictory/duplicate policies, and testability against supported device and service capabilities. Show actionable errors.
2. **Role binding:** Students tag placed endpoints with a scenario role; the binding never changes network behavior.
3. **Topology/configuration snapshot:** Read actual links, interface states, VLAN membership/trunks, IP/masks/gateways, routing, NAT, ACL/firewall rules, wireless association, and enabled services.
4. **Requirement evaluation:** Use the same forwarding/security behavior model as PacketTracker's Designer/simulation. For allowed traffic, require successful end-to-end initiation and appropriate response. For denied traffic, verify prohibition on an otherwise operational network; avoid false passes from disconnected devices.
5. **All-pairs testing:** For each role relationship, evaluate every source/destination device pair and report counts (e.g. `6/8 passed`) and specific failing pairs. `allow` and `deny` both use all-pairs semantics by default.
6. **Live feedback:** Re-evaluate affected requirements after configuration/topology changes, debounced. States: `passed`, `failed`, `not_evaluable` (missing prerequisites or unsupported/indeterminate). Never silently pass unsupported tests.
7. **Submission:** Re-evaluate the saved authoritative network state on the server. Do not trust browser-reported scores.
8. **Diagnostics:** Preserve source, destination, service, expected/observed behavior, and failure reason so a future “Investigate” packet visualization can explain failures.

## Open decisions for Codex review (do not silently assume)

- Exact device type IDs and available simulated service capabilities.
- Supported test profiles for `any`, TCP/UDP/ICMP, and service semantics.
- How to validate operational readiness for a negative isolation test, including permitted positive dependencies.
- Whether roles may contain heterogeneous devices; how extras are counted and assessed.
- Whether `count` means exact or minimum, and what to do with unassigned endpoints.
- How to represent wireless access-point requirements separately from wireless clients.
- How to represent shared infrastructure and server role segmentation (e.g., a DMZ).
- Exact constraint registry, point weights, partial credit, and schema migration/versioning.
- How to define a simulated Internet endpoint and test external reachability reliably.

**Implementation principle:** First inventory the existing network engine and determine which evaluations are actually supported. Implement a small, truthful set of evaluators and reject unsupported project requirements; do not fabricate passing results or introduce an independent grading-only network model.
