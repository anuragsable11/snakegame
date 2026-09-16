/**
 * HUNGRY NOODLE 3D — deterministic replay.
 *
 * A run is fully described by three things:
 *
 *     seed + configuration + tick-indexed inputs  →  the whole run
 *
 * So a replay stores only those. No snapshots, no per-frame state, no
 * rendering data. Playback feeds the recorded inputs back into the *same*
 * engine — there is deliberately no second simulation implementation, because
 * a second implementation is a second set of bugs.
 *
 * Replay shape (version 1):
 *
 *   {
 *     version: 1,
 *     seed: 8473921,
 *     config: { mode, difficulty, gridSize },
 *     inputs: [ { tick: 12, dir: 'up' }, { tick: 24, dir: 'right' } ],
 *     result: { tick, score, length, cause, fingerprint }
 *   }
 *
 * `result` is what makes a replay verifiable: replaying it must reproduce that
 * fingerprint. This is a reproducibility check, not an anti-cheat system — the
 * data is client-side and trivially editable.
 */
(function (NS) {
  'use strict';

  /** Bump when the replay shape or the simulation changes meaning. */
  const REPLAY_VERSION = 1;

  NS.REPLAY_VERSION = REPLAY_VERSION;

  /** Playback refuses to run anything that is not exactly this shape. */
  function validate(replay) {
    if (!replay || typeof replay !== 'object') return 'not an object';
    if (replay.version !== REPLAY_VERSION) {
      return `unsupported version ${replay.version} (expected ${REPLAY_VERSION})`;
    }
    if (!Number.isFinite(replay.seed)) return 'missing or invalid seed';
    if (!replay.config || typeof replay.config !== 'object') return 'missing config';
    if (!NS.MODES[replay.config.mode]) return `unknown mode ${replay.config.mode}`;
    if (!NS.DIFFICULTIES[replay.config.difficulty]) {
      return `unknown difficulty ${replay.config.difficulty}`;
    }
    if (!Array.isArray(replay.inputs)) return 'missing inputs';
    for (const input of replay.inputs) {
      if (!input || !Number.isFinite(input.tick) || input.tick < 0) return 'bad input tick';
      if (!NS.DIRECTIONS[input.dir]) return `bad input direction ${input && input.dir}`;
    }
    return null;
  }

  NS.validateReplay = validate;

  NS.isReplayPlayable = function isReplayPlayable(replay) {
    return validate(replay) === null;
  };

  /* ====================================================================== *
   * Recording
   * ====================================================================== */

  /**
   * Watches a live engine and writes down what it would take to reproduce it.
   *
   * Only accepted turns are recorded — a rejected turn changes nothing, and
   * replaying the accepted ones against the same state reproduces the run.
   *
   * @param {object} engine
   * @returns {{ onTurn: function(string): void, start: function(): void,
   *   finish: function(): object, toReplay: function(): object, size: function(): number }}
   */
  NS.createRecorder = function createRecorder(engine) {
    let inputs = [];
    let config = null;

    function snapshotConfig() {
      return {
        mode: engine.state.mode.id,
        difficulty: engine.state.difficulty.id,
        gridSize: engine.state.gridSize,
      };
    }

    return {
      /** Call right after engine.start(). */
      start() {
        inputs = [];
        config = snapshotConfig();
      },

      /**
       * Record a turn that the engine accepted, stamped with the tick it was
       * accepted on. The engine applies queued turns on the following tick, so
       * replaying at the same tick reproduces the same timing exactly.
       */
      onTurn(dir) {
        inputs.push({ tick: engine.state.tick, dir });
      },

      size() {
        return inputs.length;
      },

      /** The replay so far, including the result fingerprint. */
      toReplay() {
        return {
          version: REPLAY_VERSION,
          seed: engine.getSeed(),
          config: config || snapshotConfig(),
          inputs: inputs.slice(),
          result: {
            tick: engine.state.tick,
            score: engine.state.score,
            length: engine.state.snake.length,
            cause: engine.state.deathCause,
            fingerprint: engine.fingerprint(),
          },
        };
      },

      /** Alias that reads better at the end of a run. */
      finish() {
        return this.toReplay();
      },
    };
  };

  /* ====================================================================== *
   * Playback
   * ====================================================================== */

  /**
   * Build an engine positioned at the start of a replay, plus a stepper that
   * feeds the recorded inputs at the recorded ticks.
   *
   * The caller decides *when* to advance — tests run it flat out, the ghost
   * advances it in real time — but never *what* happens, which is fixed by the
   * seed and the inputs.
   *
   * @param {object} replay
   * @param {object} [options]
   * @param {function} [options.createEngine] injection point for tests
   * @returns {{ engine: object, step: function(): boolean, done: function(): boolean,
   *   runToEnd: function(number=): object }}
   */
  NS.createPlayback = function createPlayback(replay) {
    const problem = validate(replay);
    if (problem) throw new Error(`Unplayable replay: ${problem}`);

    const engine = NS.createEngine({
      seed: replay.seed,
      mode: replay.config.mode,
      difficulty: replay.config.difficulty,
      gridSize: replay.config.gridSize,
      // Playback must never consult a wall clock
      now: () => 0,
    });

    engine.start();

    // Inputs grouped by tick, so applying them is a lookup rather than a scan
    const byTick = new Map();
    for (const input of replay.inputs) {
      if (!byTick.has(input.tick)) byTick.set(input.tick, []);
      byTick.get(input.tick).push(input.dir);
    }
    const lastInputTick = replay.inputs.length
      ? replay.inputs[replay.inputs.length - 1].tick
      : 0;

    function applyInputsForCurrentTick() {
      const turns = byTick.get(engine.state.tick);
      if (!turns) return;
      for (const dir of turns) engine.queueTurn(dir);
    }

    let finished = false;

    return {
      engine,

      /** True once the run ended or the recorded inputs are exhausted. */
      done() {
        return finished;
      },

      /**
       * Apply any inputs recorded for the current tick, then advance one tick.
       * @returns {boolean} true while playback is still going
       */
      step() {
        if (finished) return false;
        applyInputsForCurrentTick();
        const alive = engine.tick();
        if (!alive) {
          finished = true;
          return false;
        }
        // A replay that outlives its inputs has nothing left to reproduce
        if (replay.result && engine.state.tick >= replay.result.tick) {
          finished = true;
        }
        return !finished;
      },

      /**
       * Run the whole thing.
       * @param {number} [maxTicks] safety valve
       * @returns {{ tick, score, length, cause, fingerprint, status }}
       */
      runToEnd(maxTicks) {
        const limit = maxTicks || Math.max(1000, (replay.result ? replay.result.tick : 0) + 10);
        let guard = 0;
        while (!finished && guard < limit) {
          this.step();
          guard += 1;
        }
        return {
          tick: engine.state.tick,
          score: engine.state.score,
          length: engine.state.snake.length,
          cause: engine.state.deathCause,
          status: engine.state.status,
          fingerprint: engine.fingerprint(),
        };
      },

      lastInputTick,
    };
  };

  /* ====================================================================== *
   * Verification
   * ====================================================================== */

  /**
   * Replay a recording and check it lands where it says it does.
   *
   * @param {object} replay
   * @returns {{ ok: boolean, reason: string|null, expected: object|null, actual: object|null }}
   */
  NS.verifyReplay = function verifyReplay(replay) {
    const problem = validate(replay);
    if (problem) return { ok: false, reason: problem, expected: null, actual: null };
    if (!replay.result || typeof replay.result.fingerprint !== 'string') {
      return { ok: false, reason: 'replay has no recorded result', expected: null, actual: null };
    }

    let actual;
    try {
      actual = NS.createPlayback(replay).runToEnd();
    } catch (error) {
      return { ok: false, reason: error.message, expected: replay.result, actual: null };
    }

    const expected = replay.result;
    const mismatch = [];
    if (actual.fingerprint !== expected.fingerprint) mismatch.push('fingerprint');
    if (actual.score !== expected.score) mismatch.push('score');
    if (actual.tick !== expected.tick) mismatch.push('tick');
    if (actual.length !== expected.length) mismatch.push('length');

    return {
      ok: mismatch.length === 0,
      reason: mismatch.length === 0 ? null : `diverged: ${mismatch.join(', ')}`,
      expected,
      actual,
    };
  };

  /**
   * Find the first tick where two runs of the same replay disagree.
   * Only used when verification already failed, so the cost doesn't matter.
   *
   * @returns {{ tick: number, a: string, b: string }|null} null when identical
   */
  NS.findDivergence = function findDivergence(replay, otherReplay) {
    const left = NS.createPlayback(replay);
    const right = NS.createPlayback(otherReplay || replay);
    const limit = 10000;

    for (let i = 0; i < limit; i += 1) {
      const leftAlive = left.step();
      const rightAlive = right.step();
      const a = left.engine.fingerprint();
      const b = right.engine.fingerprint();
      if (a !== b) return { tick: left.engine.state.tick, a, b };
      if (!leftAlive && !rightAlive) return null;
      if (leftAlive !== rightAlive) {
        return { tick: left.engine.state.tick, a, b };
      }
    }
    return null;
  };

  /* ====================================================================== *
   * Serialisation
   * ====================================================================== */

  /** Compact JSON — inputs are the only thing that grows with run length. */
  NS.serialiseReplay = function serialiseReplay(replay) {
    return JSON.stringify(replay);
  };

  /** @returns {object|null} null for anything unusable, never throws. */
  NS.parseReplay = function parseReplay(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return null;
    }
    return validate(parsed) === null ? parsed : null;
  };
}(window.HungryNoodle));
