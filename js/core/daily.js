/**
 * HUNGRY NOODLE 3D — the Daily Challenge.
 *
 *     UTC date string  →  stable hash  →  seed  →  identical run for everyone
 *
 * UTC, not local time, so the challenge flips at the same instant worldwide and
 * a player cannot get a second attempt by changing timezone. There is no
 * server: the "same challenge for everyone" property comes from the date being
 * the only input, and from the engine being deterministic.
 *
 * Difficulty is pinned to Normal. A challenge that changes with a difficulty
 * setting would not be the same challenge.
 */
(function (NS) {
  'use strict';

  /** Difficulty is fixed so everyone plays the same board at the same speed. */
  const DAILY_DIFFICULTY = 'normal';

  NS.DAILY_DIFFICULTY = DAILY_DIFFICULTY;

  /**
   * Today's date as YYYY-MM-DD in UTC.
   * @param {Date} [date] injectable for tests
   * @returns {string}
   */
  NS.dailyDateKey = function dailyDateKey(date) {
    // Duck-typed rather than `instanceof Date`: a Date built in another
    // realm (an iframe, or a test sandbox) fails instanceof but works fine.
    const when = date && typeof date.getUTCFullYear === 'function' ? date : new Date();
    const year = when.getUTCFullYear();
    const month = String(when.getUTCMonth() + 1).padStart(2, '0');
    const day = String(when.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * The seed for a given date. Namespaced so the daily seed for a date can
   * never collide with an unrelated seed that happens to hash the same.
   * @param {string} dateKey YYYY-MM-DD
   * @returns {number} unsigned 32-bit integer
   */
  NS.dailySeed = function dailySeed(dateKey) {
    return NS.hashString(`hungry-noodle/daily/${dateKey}`);
  };

  /**
   * Everything needed to start today's challenge.
   * @param {Date} [date]
   * @returns {{ date: string, seed: number, mode: string, difficulty: string }}
   */
  NS.dailyChallenge = function dailyChallenge(date) {
    const dateKey = NS.dailyDateKey(date);
    return {
      date: dateKey,
      seed: NS.dailySeed(dateKey),
      mode: 'daily',
      difficulty: DAILY_DIFFICULTY,
    };
  };

  /**
   * A human label like "16 Sep 2026". Built from the date key rather than the
   * Date object so it can't drift into local time.
   * @param {string} dateKey
   * @returns {string}
   */
  NS.dailyLabel = function dailyLabel(dateKey) {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = String(dateKey).split('-');
    if (parts.length !== 3) return String(dateKey);
    const month = MONTHS[Number(parts[1]) - 1];
    if (!month) return String(dateKey);
    return `${Number(parts[2])} ${month} ${parts[0]}`;
  };
}(window.HungryNoodle));
