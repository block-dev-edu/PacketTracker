#!/usr/bin/env node

import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.PACKETTRACKER_DB || 'data/packettracker.db');
const dataDirectory = dirname(databasePath);
const databaseName = basename(databasePath);
const repositoryRoot = resolve(process.env.PACKETTRACKER_TRANSFER_ROOT || resolve(import.meta.dirname, '..'));
const oneTimeRestoreScript = resolve(repositoryRoot, 'scripts/restore-student-progress.mjs');
const copiedExport = resolve(repositoryRoot, 'data/student-skill-progress.json');
const removed = [];

function removeFile(path, label) {
  if (!existsSync(path)) return;
  unlinkSync(path);
  removed.push(`${label}: ${path}`);
}

// Backups are deliberately retained until this explicit cleanup is run.
for (const name of readdirSync(dataDirectory)) {
  if (name.startsWith(`${databaseName}.before-progress-restore-`)) {
    removeFile(resolve(dataDirectory, name), 'restore backup');
  }
}

removeFile(copiedExport, 'copied progress export');
removeFile(oneTimeRestoreScript, 'embedded one-time restore data');

if (removed.length) {
  console.log('Removed student-progress transfer artifacts:');
  for (const item of removed) console.log(`- ${item}`);
} else {
  console.log('No student-progress transfer artifacts were found.');
}
console.log('The live PacketTracker database and restored student progress were not changed.');
