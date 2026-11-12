# Skill activity infrastructure

Milestone 1 adds the shared persistence and evaluation layer for built-in tutorials and teacher-created skill activities.

## Definition contract

Activity definitions use schema version `1.0`. A definition contains a stable key, instructional metadata, a serialized Designer starting network, level-specific instruction content, supported proficiency levels, publication/visibility state, and versioned deterministic requirements.

The only current evaluator is `assignment-v0.1`. It delegates to the existing assignment evaluator and therefore supports endpoint roles, Layer 2 relationships and separation, and Layer 3 ICMP allow/deny tests. Unsupported evaluator identifiers and unsupported assignment checks fail validation and cannot award completion.

## Persistence

- `skill_activities` stores built-in or teacher-owned definitions.
- `skill_activity_assignments` grants a teacher activity to a class or an individual enrolled student.
- `skill_activity_attempts` stores independent working network copies, a pinned definition snapshot, level, hint/assistance usage, deterministic results, and attempt history.
- `skill_activity_progress` stores the highest successful proficiency for each student and activity. A lower later completion never reduces it.

Completed and abandoned attempts cannot be edited. An Independent attempt that records command assistance is capped at Assisted proficiency.

## Service boundary

`src/activities/service.mjs` owns authorization and persistence. Built-in published activities are globally readable. Teachers can read and assign only their own custom activities. Students can read assigned teacher activities and can access only their own attempt documents. Teachers may inspect activity history and progress for students enrolled in their classes.

The HTTP routes under `/api/skill-activities`, `/api/skill-attempts`, and `/api/skill-progress` expose these services to the player and future dashboards.

## Milestone 2 player

Students now have a Skills entry point that launches activities in the existing Designer. The player selects a supported proficiency level, keeps instructions separate from the network document, records revealed hints, autosaves an independent attempt, resumes it across sessions, exposes the existing live deterministic requirement view, and records completion and the awarded proficiency.

The built-in `connect-two-pcs` activity is the Milestone 2 acceptance fixture. It places two role-assigned PCs and a basic switch, then requires the student to create both Ethernet links. Guided, Assisted, and Independent modes share the exact same starting topology and Layer 2 completion requirement.

## Milestone 3 skill library

The student dashboard now presents published built-in activities as a permanent categorized Skills Library. It includes category filters, an overall stacked proficiency bar, exact per-level completion buttons, highest proficiency, in-progress status, and resume/repeat controls. Progress remains attached to the student account and each skill contributes once to the overall bar at its highest completed proficiency.

The initial data-driven catalog contains:

- `configure-workstation-ipv4` under End Devices.
- `connect-two-pcs` under Switches.
- `build-switched-lan` under Switches.

All three use the existing Designer and the shared deterministic evaluator at Guided, Hinted/Assisted, and Independent levels. Adding another built-in tutorial requires adding a versioned definition rather than changing the player.
