/**
 * HUNGRY NOODLE — the comedy writer.
 *
 * Two jobs: hold the joke pools, and decide when to shut up. The second one
 * matters more — a line every single bite stops being funny within seconds,
 * so `eat` speaks about a fifth of the time and never twice in a row.
 */
(function (NS) {
  'use strict';

  const POOLS = {
    start: [
      'READY TO EAT? 🐍',
      'THE NOODLE IS HUNGRY!',
      'breakfast time',
      'let him cook',
      'objective: snacks',
      'I have not eaten in 4 seconds',
      'noodle mode: ON',
      'do not embarrass us',
    ],

    // Tiered by score so the jokes escalate as the run gets absurd
    eatEarly: [
      'YUM!',
      'MORE FOOD!',
      'THAT WAS GOOD!',
      'nom',
      'delicious. next.',
      'tasty little guy',
      'chomp',
      'five stars ⭐',
      'need more',
      'that hit different',
      'thank you chef',
      'still hungry tho',
    ],
    eatMid: [
      'Bro is STILL hungry 💀',
      'Someone stop this snake!',
      'unhinged eating',
      'the noodle grows',
      'save some for later',
      'this is my job now',
      'insatiable',
      'feed me again',
      'longer. LONGER.',
      'no notes. more food.',
      'hungry hungry noodle',
    ],
    eatLate: [
      'This noodle has no limits!',
      'ABSOLUTE UNIT 🐍',
      'call a doctor',
      'I contain a buffet',
      'the board fears me',
      'peak noodle',
      'somebody check on him',
      'this is a lifestyle',
      'I am the food chain',
      'legally a snack now',
      'the hunger is eternal',
    ],

    level: [
      'FASTER 😳',
      'speed unlocked',
      'oh no he is quick now',
      'turbo noodle',
      'slow down!! (do not)',
      'zoomies activated',
      'gotta go fast',
      'the pace is unreasonable',
      'level up 🔥',
      'brakes? never heard of them',
    ],

    close: [
      'WOAH.',
      'that was close',
      'nearly became a memory',
      'phew 😮‍💨',
      'do not do that again',
      'saw my life flash',
      'skill issue avoided',
      'close one, chef',
    ],

    idle: [
      'are we going somewhere?',
      'straight line enjoyer',
      'turn occasionally maybe',
      'hello? food?',
      'this is a very long hallway',
      'bored noodle',
    ],

    record: [
      'NEW RECORD 🏆',
      'personal best!',
      'the noodle peaked',
      'put it in the museum',
      'nobody has eaten harder',
      'certified unit',
    ],

    overWall: [
      'Bro forgot how to turn.',
      'THE NOODLE HAS CRASHED 💀',
      'the wall was right there',
      'walls: 1, noodle: 0',
      'that was a wall, chef',
      'straight into it. bold.',
      'RIP NOODLE 🐍',
    ],
    overSelf: [
      'TOO MUCH FOOD!',
      'The noodle has left the chat.',
      'you ate YOURSELF',
      'cannibal behaviour',
      'bro was the snack',
      'self-inflicted noodle',
      'RIP NOODLE 🐍',
      'THE NOODLE HAS CRASHED 💀',
    ],
    overWin: [
      'YOU ATE EVERYTHING 🏆',
      'the board is empty. so are you.',
      'nothing left. legend.',
      'perfect noodle',
    ],

    theme: [
      'new fit 🔥',
      'looking good',
      'same hunger, new colours',
      'drip check',
    ],
  };

  /** How often a trigger is allowed to speak. */
  const EAT_CHANCE = 0.22;
  const EAT_COOLDOWN_MS = 2500;
  const IDLE_COOLDOWN_MS = 12000;

  NS.createBanter = function createBanter() {
    let lastLine = '';
    let lastEatAt = -Infinity;
    let lastIdleAt = -Infinity;
    let clock = 0;             // advanced by pick() calls, not wall time
    const recent = new Map();  // pool name -> Set of recently used lines

    /**
     * Pull a line, avoiding anything used recently in that pool. Once half a
     * pool has been used the memory resets, which keeps it fresh without ever
     * running out of options.
     */
    function choose(poolName) {
      const pool = POOLS[poolName];
      if (!pool || pool.length === 0) return null;

      let used = recent.get(poolName);
      if (!used) {
        used = new Set();
        recent.set(poolName, used);
      }
      if (used.size >= Math.ceil(pool.length / 2)) used.clear();

      const available = pool.filter((line) => !used.has(line) && line !== lastLine);
      const source = available.length > 0 ? available : pool;
      const line = source[Math.floor(Math.random() * source.length)];

      used.add(line);
      lastLine = line;
      return line;
    }

    function eatPool(score) {
      if (score >= 400) return 'eatLate';
      if (score >= 120) return 'eatMid';
      return 'eatEarly';
    }

    return {
      /**
       * @param {string} trigger start|eat|level|close|idle|record|over|theme
       * @param {object} context {score, streak, level, cause, seconds}
       * @returns {string|null} null means "stay quiet"
       */
      pick(trigger, context) {
        const ctx = context || {};
        clock += 1;
        // A coarse clock is enough: ~1 tick per event, plus real time when
        // the caller supplies it. Cooldowns only need to feel right.
        const now = typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : clock * 400;

        switch (trigger) {
          case 'start':
            lastEatAt = -Infinity;
            return choose('start');

          case 'eat': {
            if (now - lastEatAt < EAT_COOLDOWN_MS) return null;
            if (Math.random() > EAT_CHANCE) return null;
            lastEatAt = now;
            return choose(eatPool(ctx.score || 0));
          }

          case 'level':
            return choose('level');

          case 'close':
            return choose('close');

          case 'idle': {
            if (now - lastIdleAt < IDLE_COOLDOWN_MS) return null;
            lastIdleAt = now;
            return choose('idle');
          }

          case 'record':
            return choose('record');

          case 'over':
            if (ctx.cause === 'win') return choose('overWin');
            if (ctx.cause === 'self') return choose('overSelf');
            return choose('overWall');

          case 'theme':
            return choose('theme');

          default:
            return null;
        }
      },

      reset() {
        lastLine = '';
        lastEatAt = -Infinity;
        lastIdleAt = -Infinity;
        recent.clear();
      },
    };
  };
}(window.HungryNoodle));
