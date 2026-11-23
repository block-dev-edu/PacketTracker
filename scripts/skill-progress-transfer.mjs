#!/usr/bin/env node

import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ranks = { guided: 1, assisted: 2, independent: 3 };

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  node scripts/skill-progress-transfer.mjs export --db <source.db> --out <progress.json>
  node scripts/skill-progress-transfer.mjs import --db <target.db> --input <progress.json> [--apply] [--backup <backup.db>]

Import is a dry run unless --apply is supplied. Stop PacketTracker before an applied import.`);
  process.exit(message ? 1 : 0);
}

function argumentsFor(argv) {
  const result = { command: argv[0] };
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--apply') result.apply = true;
    else if (argument.startsWith('--')) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) usage(`${argument} requires a value`);
      result[argument.slice(2)] = value;
    } else usage(`Unknown argument: ${argument}`);
  }
  return result;
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function requireTables(db) {
  const required = ['users', 'skill_activities', 'skill_activity_attempts', 'skill_activity_progress'];
  const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  const missing = required.filter(table => !present.has(table));
  if (missing.length) throw new Error(`Database is missing required tables: ${missing.join(', ')}`);
}

function parseJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function exportProgress(databasePath, outputPath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  requireTables(db);
  const students = db.prepare("SELECT id,name,email FROM users WHERE role='student' ORDER BY name COLLATE NOCASE,id").all();
  const progressRows = db.prepare(`
    SELECT sap.student_id,sa.activity_key,json_extract(sa.definition,'$.title') title,
      sap.highest_level,sap.completed_at
    FROM skill_activity_progress sap
    JOIN skill_activities sa ON sa.id=sap.activity_id
    JOIN users u ON u.id=sap.student_id
    WHERE u.role='student'
    ORDER BY sap.student_id,sa.activity_key
  `).all();
  const attemptRows = db.prepare(`
    SELECT saa.student_id,sa.activity_key,saa.awarded_level,saa.working_document,
      saa.hint_usage,saa.command_assistance_used,saa.evaluation_result,saa.completed_at,saa.id
    FROM skill_activity_attempts saa
    JOIN skill_activities sa ON sa.id=saa.activity_id
    JOIN users u ON u.id=saa.student_id
    WHERE u.role='student' AND saa.status='completed' AND saa.awarded_level IS NOT NULL
    ORDER BY saa.student_id,sa.activity_key,saa.completed_at DESC,saa.id DESC
  `).all();

  const attemptsByStudentSkill = new Map();
  for (const row of attemptRows) {
    const key = `${row.student_id}\u0000${row.activity_key}`;
    const byLevel = attemptsByStudentSkill.get(key) || new Map();
    if (!byLevel.has(row.awarded_level)) byLevel.set(row.awarded_level, {
      level: row.awarded_level,
      completedAt: row.completed_at,
      workingDocument: parseJson(row.working_document, null),
      hintUsage: parseJson(row.hint_usage, []),
      commandAssistanceUsed: Boolean(row.command_assistance_used),
      evaluationResult: parseJson(row.evaluation_result, null)
    });
    attemptsByStudentSkill.set(key, byLevel);
  }

  const progressByStudent = new Map(students.map(student => [student.id, []]));
  for (const row of progressRows) {
    const artifacts = [...(attemptsByStudentSkill.get(`${row.student_id}\u0000${row.activity_key}`) || new Map()).values()]
      .sort((left, right) => (ranks[left.level] || 0) - (ranks[right.level] || 0));
    progressByStudent.get(row.student_id)?.push({
      activityKey: row.activity_key,
      title: row.title,
      highestLevel: row.highest_level,
      completedAt: row.completed_at,
      completedLevels: artifacts.map(item => item.level),
      attempts: artifacts
    });
  }

  const document = {
    format: 'packettracker-skill-progress',
    version: 1,
    exportedAt: new Date().toISOString(),
    matching: 'normalized student name; email is used only to disambiguate duplicate names',
    students: students.map(student => ({
      name: student.name,
      email: student.email,
      progress: progressByStudent.get(student.id) || []
    }))
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  const skillCount = document.students.reduce((sum, student) => sum + student.progress.length, 0);
  console.log(`Exported ${document.students.length} students and ${skillCount} skill progress records to ${outputPath}`);
}

function matchStudents(sourceStudents, targetStudents) {
  const sourceGroups = Map.groupBy(sourceStudents, student => normalizeName(student.name));
  const targetGroups = Map.groupBy(targetStudents, student => normalizeName(student.name));
  const matches = [];
  const skipped = [];

  for (const [name, sources] of sourceGroups) {
    const targets = targetGroups.get(name) || [];
    if (sources.length === 1 && targets.length === 1) {
      matches.push({ source: sources[0], target: targets[0], method: 'name' });
      continue;
    }
    if (!targets.length) {
      for (const source of sources) skipped.push({ name: source.name, reason: 'no matching student name on target' });
      continue;
    }
    const unusedTargets = new Set(targets);
    for (const source of sources) {
      const sourceEmail = normalizeEmail(source.email);
      const emailMatches = [...unusedTargets].filter(target => sourceEmail && normalizeEmail(target.email) === sourceEmail);
      if (emailMatches.length === 1) {
        matches.push({ source, target: emailMatches[0], method: 'name+email' });
        unusedTargets.delete(emailMatches[0]);
      } else skipped.push({ name: source.name, reason: `ambiguous name (${sources.length} source, ${targets.length} target accounts)` });
    }
  }
  return { matches, skipped };
}

function importProgress(databasePath, inputPath, apply, requestedBackupPath) {
  const document = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (document?.format !== 'packettracker-skill-progress' || document?.version !== 1 || !Array.isArray(document.students)) {
    throw new Error('Input is not a supported PacketTracker skill-progress export');
  }
  const db = new DatabaseSync(databasePath);
  requireTables(db);
  db.exec('PRAGMA foreign_keys=ON');
  const targetStudents = db.prepare("SELECT id,name,email FROM users WHERE role='student' ORDER BY id").all();
  const { matches, skipped } = matchStudents(document.students, targetStudents);
  const activities = new Map(db.prepare('SELECT id,activity_key,definition,definition_version FROM skill_activities').all().map(row => [row.activity_key, row]));
  const plan = [];
  const missingActivities = [];

  for (const { source, target, method } of matches) {
    for (const progress of source.progress || []) {
      const activity = activities.get(progress.activityKey);
      if (!activity) {
        missingActivities.push({ student: source.name, activityKey: progress.activityKey });
        continue;
      }
      const completedLevels = [...new Set([...(progress.completedLevels || []), progress.highestLevel].filter(level => ranks[level]))];
      const existing = db.prepare("SELECT awarded_level,id FROM skill_activity_attempts WHERE student_id=? AND activity_id=? AND status='completed' AND awarded_level IS NOT NULL").all(target.id, activity.id);
      const existingLevels = new Set(existing.map(row => row.awarded_level));
      plan.push({ source, target, method, progress, activity, completedLevels, missingLevels: completedLevels.filter(level => !existingLevels.has(level)), existing });
    }
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    matchedStudents: matches.length,
    skippedStudents: skipped.length,
    matchedSkills: plan.length,
    attemptsToCreate: plan.reduce((sum, item) => sum + item.missingLevels.length, 0),
    missingActivities: missingActivities.length
  };
  console.log(JSON.stringify(summary, null, 2));
  if (skipped.length) console.log('\nSkipped students:\n' + skipped.map(item => `- ${item.name}: ${item.reason}`).join('\n'));
  if (missingActivities.length) console.log('\nMissing target activities:\n' + missingActivities.map(item => `- ${item.student}: ${item.activityKey}`).join('\n'));
  if (!apply) {
    console.log('\nDry run only. Run again with --apply after reviewing this report.');
    return;
  }

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const backupPath = requestedBackupPath || `${databasePath}.before-skill-import-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
  mkdirSync(dirname(backupPath), { recursive: true });
  copyFileSync(databasePath, backupPath);

  const insertAttempt = db.prepare(`
    INSERT INTO skill_activity_attempts
      (activity_id,student_id,activity_version,definition_snapshot,requested_level,awarded_level,working_document,status,hint_usage,command_assistance_used,evaluation_result,started_at,updated_at,completed_at)
    VALUES (?,?,?,?,?,?,?,'completed',?,?,?,?,?,?)
  `);
  const upsertProgress = db.prepare(`
    INSERT INTO skill_activity_progress (activity_id,student_id,highest_level,highest_rank,attempt_id,completed_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(activity_id,student_id) DO UPDATE SET
      highest_level=excluded.highest_level,highest_rank=excluded.highest_rank,
      attempt_id=excluded.attempt_id,completed_at=excluded.completed_at
    WHERE excluded.highest_rank>skill_activity_progress.highest_rank
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of plan) {
      const definition = parseJson(item.activity.definition, {});
      const artifactByLevel = new Map((item.progress.attempts || []).map(attempt => [attempt.level, attempt]));
      const attemptIds = new Map(item.existing.map(attempt => [attempt.awarded_level, attempt.id]));
      for (const level of item.missingLevels) {
        const artifact = artifactByLevel.get(level) || {};
        const completedAt = artifact.completedAt || item.progress.completedAt || new Date().toISOString();
        const result = insertAttempt.run(
          item.activity.id, item.target.id, item.activity.definition_version, item.activity.definition,
          level, level, JSON.stringify(artifact.workingDocument || definition.startingNetwork || { version: 2, devices: [], connections: [], notes: [], segments: [] }),
          JSON.stringify(artifact.hintUsage || []), artifact.commandAssistanceUsed ? 1 : 0,
          JSON.stringify(artifact.evaluationResult || { completed: true, imported: true }), completedAt, completedAt, completedAt
        );
        attemptIds.set(level, Number(result.lastInsertRowid));
      }
      const highestLevel = item.progress.highestLevel;
      const attemptId = attemptIds.get(highestLevel);
      if (attemptId) upsertProgress.run(item.activity.id, item.target.id, highestLevel, ranks[highestLevel], attemptId, item.progress.completedAt || new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  console.log(`\nImport complete. Backup created at ${backupPath}`);
}

const options = argumentsFor(process.argv.slice(2));
if (!['export', 'import'].includes(options.command)) usage('Choose export or import');
if (!options.db) usage('--db is required');

try {
  const databasePath = resolve(options.db);
  if (options.command === 'export') {
    if (!options.out) usage('--out is required for export');
    exportProgress(databasePath, resolve(options.out));
  } else {
    if (!options.input) usage('--input is required for import');
    importProgress(databasePath, resolve(options.input), Boolean(options.apply), options.backup ? resolve(options.backup) : null);
  }
} catch (error) {
  console.error(`Skill progress transfer failed: ${error.message}`);
  process.exit(1);
}
