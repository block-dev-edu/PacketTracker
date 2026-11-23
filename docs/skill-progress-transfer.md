# Student skill progress transfer

## One-command restore for the collected classroom data

The collected November 23, 2026 classroom progress is embedded in the repository. After pulling the current code onto the cloud server, stop PacketTracker and run this from the repository root:

```powershell
npm run progress:restore
```

The command uses `data/packettracker.db`, or the path in `PACKETTRACKER_DB` when that environment variable is set. It creates a backup automatically, matches cloud student accounts by normalized name, restores missing completed levels, and prints names it could not match. Restart PacketTracker after the command finishes.

After restarting the site and verifying the restored progress, remove the one-time embedded data, copied export file, and restore backups with:

```powershell
npm run progress:cleanup
```

Cleanup does not alter the live database or any restored progress. It deletes the one-time restore script, so `progress:restore` is intentionally unavailable afterward unless the file is restored from Git. Because that restore script is tracked for delivery to the cloud server, make a follow-up cleanup commit after the migration if the collected data should also be removed from repository history going forward.

The general export/import workflow below remains available for future transfers.

The transfer tool moves completed skill proficiency between PacketTracker SQLite databases. It matches activities by their stable activity key and students by a normalized full name. Email is used only when duplicate student names need to be disambiguated.

It does not transfer passwords, sessions, projects, class membership, assignments, or unfinished attempts.

## Export from the source server

Stop PacketTracker before accessing its database, then run:

```powershell
node scripts/skill-progress-transfer.mjs export --db data/packettracker.db --out data/student-skill-progress.json
```

Copy `data/student-skill-progress.json` to the target server through a secure channel. The file contains student names, email addresses, completed proficiency levels, and the saved documents associated with those completions. It is intentionally ignored by Git through the existing `data/` rule.

## Preview the target import

Stop PacketTracker on the target server. Run the importer without `--apply` first:

```powershell
node scripts/skill-progress-transfer.mjs import --db data/packettracker.db --input data/student-skill-progress.json
```

Review the counts and every skipped student. The tool skips names that are missing or ambiguous rather than guessing. It also reports activity keys that do not exist on the target server.

## Apply the import

After reviewing the dry run:

```powershell
node scripts/skill-progress-transfer.mjs import --db data/packettracker.db --input data/student-skill-progress.json --apply
```

Before changing any records, the tool checkpoints SQLite and creates a timestamped backup beside the target database. The import creates missing completed proficiency-level attempts, rebuilds highest skill progress, and preserves any higher proficiency already present on the target. It is safe to run again: existing completed levels are not duplicated.

If the server uses a custom database path, pass that path to `--db`. A specific backup path can be supplied with `--backup`.
