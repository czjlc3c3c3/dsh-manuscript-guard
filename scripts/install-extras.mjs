#!/usr/bin/env node
/**
 * Post-install script for dsh-manuscript-guard.
 * Copies the skill files to the DSH home directory.
 *
 * Text-only fork: the Python word_guard module is gone, so this script no
 * longer copies Python files or probes for python-docx.
 *
 * This script NEVER throws — failures are logged as warnings so npm install
 * does not fail. The plugin works without the skill files; they just enable
 * natural-language triggering.
 */
import { existsSync, mkdirSync, cpSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = join(__dirname, '..')

// DSH home directory — handle Windows, macOS, Linux
function getDshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  // Windows: USERPROFILE, Unix: HOME
  const home = process.env.USERPROFILE || process.env.HOME
  if (!home) return null
  return join(home, '.dsh')
}

function copyDir(src, dest) {
  if (!existsSync(src)) return false
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })
  return true
}

// Main — wrapped in a top-level catch that never exits with code 1
try {
  const DSH_HOME = getDshHome()
  if (!DSH_HOME) {
    console.warn('[dsh-manuscript-guard] Could not determine DSH_HOME — skipping postinstall setup')
    console.warn('[dsh-manuscript-guard] You can manually copy skills/ later')
    // Exit successfully — this is not a fatal error
    process.exit(0)
  }

  // 1. Copy skill files to ~/.dsh/skills/writing-guard/
  try {
    const skillSrc = join(PLUGIN_ROOT, 'skills', 'writing-guard')
    const skillDest = join(DSH_HOME, 'skills', 'writing-guard')
    if (existsSync(skillSrc)) {
      copyDir(skillSrc, skillDest)
      console.log(`[dsh-manuscript-guard] Skill installed to ${skillDest}`)
    }
  } catch (e) {
    console.warn(`[dsh-manuscript-guard] Could not install skill: ${e.message}`)
  }

  console.log('[dsh-manuscript-guard] Postinstall complete')
} catch (e) {
  // Last resort — never let postinstall fail the npm install
  console.warn(`[dsh-manuscript-guard] Postinstall warning: ${e.message}`)
}
