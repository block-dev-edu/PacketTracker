#!/usr/bin/env node

import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

// Collected from the local PacketTracker database on 2026-11-23. Duplicate
// local accounts with the same normalized name are merged by completed level.
const collected = 'H4sIAAAAAAACCpVVXU8bRxT9K6t96YtXKjTk6402bSLT9ENtlQeLh2F32J2wnrF2ZiFWFckYKBhcQcGAg2hEiSL1MyKkaUmJ2j9w7n+qdrFhvV3T5OmO5s49c+6Ze+98bTP7ZsWeYlq4zrSI+BwLQ6emQuEKru2SPRWL0HP0nDBuwD0nZNIu2a6S08KPI+5wz+dOpGLDo8F96dWUkMbx+DSLQ+P4zPA5Vh84VFORcTR340iYQc9syKTDXJdrnZ7S//WaKJYzg/tzKprRhhmhpCNqs1fOnJK7xjFzyqm56fGIM8OdKpPM5/3MUsjE6wnmS6W5I7lJ4JwegJg9o5iy5Y52A6XC8ygTqXgq5DpQyjii5vQppVTsyZKt7ZuVij0upA553SormWhbqbxbsoU9WaqMlGw/XYyWbJYuxnqeqyXbT+y1vuN6/+iNfuxIupicLFVsFvIHguWQ83iih9eHG4o2nqJZ4x6r6iLM0UKsNPT9iHlcWn7MtUlCR3ppjPbsexehbIDHyPklowNo0lPS+kjw0MvrloUd69nrPXsjtSnGB0xr4dUHojO59txWWc3wYcn6w14mr6R/jhqwKOTa+ixipq+DyBK+NkA4jbnFmbRuR2z2jEcmxbzY+RQ9FTFPWfcz1eUXynQlJ9fVAjYiB/6hCZi07jFTVRG/rBouAy8ouRT8diSmp4W07oowTAZJhnteqeyjBSJJ9oJMunknfhDy+hCGLPuCBUTKrJo8Vz3sp+jnAURBLmehKpDW57GQhkmWi/az17+J+hfiD2ZcVtK6w03IZL8PWBb6Ws9maN1X8h1tscgNuOTVerYI8zOhSI+YyaKGy3MvqMZy7HHrlpI81Eq+5fgo409awya10cE8lqgT4wR7WMYiGlimJjXoezSpSd/hgJbwDK/wC55qvKQ1/INtzFOb2ljFGlq0QQ06oBZ18Br7Bn9gnRaxTrvYxhEeoUtLOKQd/IRXtIXfqCVwglVaRRPbaGKeGvgZL3CKU+ziCMfUQheHtIUfcCjxEmtoUpuW8CPt4DGO8QTP8YL28Jq2aB9HeI7HFk6wTItYQRtt6tIGVqibkl+jBg4+xgkS5x7WaRMdtPENtmmT5rGOJvbwF7p4qnCCb9FJHFinJnWxQU0s0AIt4ldakskV2KJdrNBCohEatErzOKV92qMO9qmFI+zgFId44uN3tPE3ntEOtXBMjy77MIrG2kQ63O+ySOikrN4w/Dy6HjJrQoWqKtwgnhk2bHP17OdhPlEssCZiOcPDbCuM5Foi8yXkR9oXqhYIXvgbDxTo2KV/ZgpluDaWkoWD8bLB92XANY+19ZX0eDSnlPc/agzDucc8bn0a6rdqtQuEyYf/AidBl3IICgAA';

const levels = { g: 'guided', a: 'assisted', i: 'independent' };
const ranks = { guided: 1, assisted: 2, independent: 3 };
const payload = JSON.parse(gunzipSync(Buffer.from(collected, 'base64')).toString('utf8'));
const databasePath = resolve(process.env.PACKETTRACKER_DB || 'data/packettracker.db');
const normalizeName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys=ON');
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
for (const table of ['users', 'skill_activities', 'skill_activity_attempts', 'skill_activity_progress']) {
  if (!tables.has(table)) throw new Error(`The target database is missing ${table}`);
}

const sourceByName = new Map(payload.s.map(([name, skills]) => [normalizeName(name), { name, skills }]));
const targetStudents = db.prepare("SELECT id,name FROM users WHERE role='student' ORDER BY id").all();
const activities = new Map(db.prepare('SELECT id,activity_key,definition,definition_version FROM skill_activities').all().map(row => [row.activity_key, row]));
const matched = targetStudents.filter(student => sourceByName.has(normalizeName(student.name)));
const unmatchedSource = [...sourceByName].filter(([name]) => !targetStudents.some(student => normalizeName(student.name) === name)).map(([, source]) => source.name);
const missingActivities = new Set();
const plan = [];

for (const student of matched) {
  const source = sourceByName.get(normalizeName(student.name));
  for (const [activityIndex, encodedLevels] of source.skills) {
    const activityKey = payload.a[activityIndex];
    const activity = activities.get(activityKey);
    if (!activity) { missingActivities.add(activityKey); continue; }
    const desiredLevels = [...encodedLevels].map(letter => levels[letter]);
    const existing = db.prepare("SELECT id,awarded_level FROM skill_activity_attempts WHERE student_id=? AND activity_id=? AND status='completed' AND awarded_level IS NOT NULL").all(student.id, activity.id);
    const existingLevels = new Set(existing.map(row => row.awarded_level));
    plan.push({ student, source, activity, desiredLevels, existing, missingLevels: desiredLevels.filter(level => !existingLevels.has(level)) });
  }
}

console.log(`Matched ${matched.length} student account${matched.length === 1 ? '' : 's'} by name.`);
console.log(`Restoring ${plan.length} completed skill record${plan.length === 1 ? '' : 's'} (${plan.reduce((sum, item) => sum + item.missingLevels.length, 0)} missing proficiency level${plan.reduce((sum, item) => sum + item.missingLevels.length, 0) === 1 ? '' : 's'}).`);
if (unmatchedSource.length) console.log(`No cloud account found for: ${unmatchedSource.join(', ')}`);
if (missingActivities.size) console.log(`Missing cloud skills: ${[...missingActivities].join(', ')}`);
if (!matched.length) throw new Error('No cloud students matched the collected names; no changes were made');

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const backupPath = `${databasePath}.before-progress-restore-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
mkdirSync(dirname(backupPath), { recursive: true });
copyFileSync(databasePath, backupPath);

const insertAttempt = db.prepare(`
  INSERT INTO skill_activity_attempts
    (activity_id,student_id,activity_version,definition_snapshot,requested_level,awarded_level,working_document,status,hint_usage,command_assistance_used,evaluation_result,started_at,updated_at,completed_at)
  VALUES (?,?,?,?,?,?,?,'completed','[]',0,?,?,?,?)
`);
const upsertProgress = db.prepare(`
  INSERT INTO skill_activity_progress (activity_id,student_id,highest_level,highest_rank,attempt_id,completed_at)
  VALUES (?,?,?,?,?,?)
  ON CONFLICT(activity_id,student_id) DO UPDATE SET
    highest_level=excluded.highest_level,highest_rank=excluded.highest_rank,
    attempt_id=excluded.attempt_id,completed_at=excluded.completed_at
  WHERE excluded.highest_rank>skill_activity_progress.highest_rank
`);

const restoredAt = new Date().toISOString();
db.exec('BEGIN IMMEDIATE');
try {
  for (const item of plan) {
    const definition = JSON.parse(item.activity.definition);
    const attemptIds = new Map(item.existing.map(attempt => [attempt.awarded_level, attempt.id]));
    for (const level of item.missingLevels) {
      const result = insertAttempt.run(
        item.activity.id, item.student.id, item.activity.definition_version, item.activity.definition,
        level, level, JSON.stringify(definition.startingNetwork || { version: 2, devices: [], connections: [], notes: [], segments: [] }),
        JSON.stringify({ completed: true, restored: true }), restoredAt, restoredAt, restoredAt
      );
      attemptIds.set(level, Number(result.lastInsertRowid));
    }
    const highestLevel = item.desiredLevels.reduce((best, level) => ranks[level] > ranks[best] ? level : best, item.desiredLevels[0]);
    const attemptId = attemptIds.get(highestLevel);
    if (attemptId) upsertProgress.run(item.activity.id, item.student.id, highestLevel, ranks[highestLevel], attemptId, restoredAt);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`Progress restore complete. Backup: ${backupPath}`);
