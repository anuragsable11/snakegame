/**
 * HUNGRY NOODLE 3D — persistence for replays and daily results.
 *
 * Deliberately separate from the engine: the simulation must not know that
 * storage exists. Everything here is defensive — a corrupt or hand-edited
 * localStorage entry must never stop the game from starting, so every read
 * returns a safe fallback instead of throwing.
 *
 * Keys (all namespaced under `noodle.`):
 *   noodle.replay.best.<mode>   best run for a mode, as replay JSON
 *   noodle.daily.v1             map of date -> { score, completed }
 */
(function (NS) {
  'use strict';

  const storage = NS.storage;

  const BEST_REPLAY_PREFIX = 'noodle.replay.best.';
  const DAILY_KEY = 'noodle.daily.v1';

  /** Keep the daily history from growing without bound. */
  const DAILY_HISTORY_LIMIT = 60;

  NS.STORAGE_KEYS_V2 = Object.freeze({
    BEST_REPLAY_PREFIX,
    DAILY: DAILY_KEY,
  });

  NS.bestReplayKey = function bestReplayKey(modeId) {
    return BEST_REPLAY_PREFIX + modeId;
  };

  /* ====================================================================== *
   * Best-run replays (the ghost)
   * ====================================================================== */

  /**
   * Load the stored best replay for a mode.
   *
   * Returns null for: nothing stored, unparseable JSON, an unsupported replay
   * version, a replay for a different configuration, or a replay that no longer
   * reproduces. Any of those simply means "no ghost today".
   *
   * @param {string} modeId
   * @param {object} [expectedConfig] {difficulty, gridSize} to match against
   * @returns {object|null}
   */
  NS.loadBestReplay = function loadBestReplay(modeId, expectedConfig) {
    const raw = storage.read(NS.bestReplayKey(modeId), '');
    const replay = NS.parseReplay(raw);
    if (!replay) return null;

    if (replay.config.mode !== modeId) return null;

    if (expectedConfig) {
      if (expectedConfig.difficulty && replay.config.difficulty !== expectedConfig.difficulty) {
        return null;
      }
      if (expectedConfig.gridSize && replay.config.gridSize !== expectedConfig.gridSize) {
        return null;
      }
      // A daily ghost is only meaningful against the same day's board
      if (expectedConfig.seed !== undefined && replay.seed !== expectedConfig.seed) {
        return null;
      }
    }

    return replay;
  };

  /**
   * Store a replay as the best for its mode, if it actually beats the stored
   * one. Verifies before writing so a run that cannot reproduce never becomes
   * somebody's ghost.
   *
   * @param {object} replay
   * @returns {boolean} true when it was stored
   */
  NS.saveBestReplay = function saveBestReplay(replay) {
    if (!replay || !NS.isReplayPlayable(replay)) return false;
    if (!replay.result || !Number.isFinite(replay.result.score)) return false;

    const existing = NS.loadBestReplay(replay.config.mode, {
      difficulty: replay.config.difficulty,
      gridSize: replay.config.gridSize,
      seed: replay.config.mode === 'daily' ? replay.seed : undefined,
    });
    if (existing && existing.result && existing.result.score >= replay.result.score) {
      return false;
    }

    const verdict = NS.verifyReplay(replay);
    if (!verdict.ok) return false;

    storage.write(NS.bestReplayKey(replay.config.mode), NS.serialiseReplay(replay));
    return true;
  };

  NS.clearBestReplay = function clearBestReplay(modeId) {
    storage.write(NS.bestReplayKey(modeId), '');
  };

  /* ====================================================================== *
   * Daily results
   * ====================================================================== */

  /** @returns {object} date -> {score, completed}; always an object. */
  NS.loadDailyResults = function loadDailyResults() {
    const raw = storage.read(DAILY_KEY, '');
    if (!raw) return {};
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    // Drop anything that isn't a well-formed entry rather than trusting it
    const clean = {};
    for (const date of Object.keys(parsed)) {
      const entry = parsed[date];
      if (!entry || typeof entry !== 'object') continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(entry.score)) continue;
      clean[date] = { score: entry.score, completed: entry.completed === true };
    }
    return clean;
  };

  /**
   * @param {string} dateKey
   * @returns {{score: number, completed: boolean}|null}
   */
  NS.getDailyResult = function getDailyResult(dateKey) {
    const all = NS.loadDailyResults();
    return all[dateKey] || null;
  };

  /**
   * Record a daily attempt, keeping the best score for that date.
   * @returns {boolean} true when this was a new personal best for the day
   */
  NS.saveDailyResult = function saveDailyResult(dateKey, score) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return false;
    if (!Number.isFinite(score)) return false;

    const all = NS.loadDailyResults();
    const previous = all[dateKey];
    const improved = !previous || score > previous.score;

    all[dateKey] = {
      score: improved ? score : previous.score,
      completed: true,
    };

    // Keep only the most recent dates — lexicographic sort works on ISO dates
    const dates = Object.keys(all).sort();
    while (dates.length > DAILY_HISTORY_LIMIT) {
      delete all[dates.shift()];
    }

    storage.write(DAILY_KEY, JSON.stringify(all));
    return improved;
  };
}(window.HungryNoodle));
