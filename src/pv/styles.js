// Art direction for each song's PV. Every chapter picks one of three moods from its
// action (calm verses, hot choruses, gold jackpots); the mood decides the sky, the
// glow, the text colours and which motion-graphic particles drift across the frame.
//
// Particle kinds are drawn in bg.js: petal heart confetti coin ball star note bolt
// paw fur ticket digit code ring spark page sun. `light` moods are pastel skies with dark ink.

const mood = (top, bottom, glow, accent, ink, particles, extra = {}) => ({ top, bottom, glow, accent, ink, particles, ...extra });

export const pvStyles = {
  wedding: {
    kicker: 'THE WILDEST REASON TO MARRY',
    pattern: 'petals',
    calm: mood('#1b1030', '#4a2346', '#ff9ccf', '#ffd6ec', '#fff4fb', ['petal', 'star', 'heart']),
    hot: mood('#3a0f2c', '#a33a62', '#ffc1dc', '#ffe08a', '#fff7fb', ['heart', 'confetti', 'petal']),
    gold: mood('#2a1606', '#8a4a10', '#ffd27a', '#fff0b0', '#fffaf0', ['ball', 'coin', 'confetti']),
    ballRange: 39,
  },
  s023: {
    kicker: 'A HUNDRED-YEAR DREAM',
    pattern: 'blueprint',
    calm: mood('#06142a', '#123a63', '#6fc3ff', '#bfe6ff', '#f2f9ff', ['spark', 'star', 'ring']),
    hot: mood('#1a0b2e', '#6a2b6e', '#ffb36b', '#ffe3a3', '#fff8ef', ['confetti', 'spark', 'star']),
    gold: mood('#1f1405', '#6e4a12', '#ffd27a', '#fff0b0', '#fffaf0', ['coin', 'spark']),
  },
  s024: {
    kicker: 'EVOLUTION LIVE SHOW',
    pattern: 'spotlights',
    calm: mood('#080b1f', '#1e2a5c', '#5ef0ff', '#a6f7ff', '#f0fdff', ['note', 'spark', 'star']),
    hot: mood('#1f0626', '#7a1460', '#ff4fd8', '#fff36b', '#fff6ff', ['bolt', 'note', 'confetti']),
    gold: mood('#1f1405', '#6e4a12', '#ffd27a', '#fff0b0', '#fffaf0', ['note', 'coin']),
  },
  s026: {
    kicker: 'ROYAL CAT FUR DECREE',
    pattern: 'dots',
    calm: mood('#ffe6f3', '#e6dcff', '#ffffff', '#ff6fae', '#4a2a5c', ['fur', 'paw', 'star'], { light: true }),
    hot: mood('#3b1430', '#c0507e', '#ffd0e6', '#fff2a6', '#fffaff', ['paw', 'fur', 'heart']),
    gold: mood('#2a1606', '#8a4a10', '#ffd27a', '#fff0b0', '#fffaf0', ['paw', 'coin']),
  },
  s027: {
    kicker: 'A LEGENDARY LIFE',
    pattern: 'rays',
    calm: mood('#0b1226', '#28325e', '#9fb6ff', '#dfe6ff', '#f6f8ff', ['star', 'spark', 'ring']),
    hot: mood('#2a0a12', '#8e1f2c', '#ff8a6b', '#ffd27a', '#fff6f0', ['confetti', 'coin', 'star']),
    gold: mood('#241203', '#9a5a0c', '#ffcf5c', '#fff3b8', '#fffaf0', ['coin', 'ticket', 'ball']),
    ballRange: 49,
  },
  s028: {
    kicker: 'BREAKING NEWS · PRINCE OF PLUMBING',
    pattern: 'scanlines',
    calm: mood('#071a22', '#16485a', '#7ff0d8', '#c8fff2', '#f2fffb', ['sun', 'spark', 'star']),
    hot: mood('#260a1c', '#8a2050', '#ff7ab0', '#ffe27a', '#fff6fa', ['confetti', 'star', 'spark']),
    gold: mood('#241203', '#9a5a0c', '#ffcf5c', '#fff3b8', '#fffaf0', ['coin', 'digit', 'confetti']),
  },
  s062: {
    kicker: 'EVOLUTION · NO UPPER LIMIT',
    pattern: 'code',
    calm: mood('#04101a', '#0f3348', '#3cf0c8', '#a8ffe9', '#effffa', ['code', 'spark', 'ring']),
    hot: mood('#14062a', '#4b1a8a', '#b07bff', '#7dfff0', '#f8f2ff', ['bolt', 'spark', 'confetti']),
    gold: mood('#1f1405', '#6e4a12', '#ffd27a', '#fff0b0', '#fffaf0', ['bolt', 'coin']),
  },
  s101: {
    kicker: 'A TALK WITH MY YEARBOOK',
    pattern: 'paper',
    calm: mood('#fff4e0', '#f3dcc0', '#ffffff', '#e0703a', '#4a3424', ['digit', 'page', 'star'], { light: true }),
    hot: mood('#2b1220', '#7a3550', '#ffb3c8', '#ffe3a0', '#fff7f4', ['digit', 'confetti', 'star']),
    gold: mood('#241203', '#9a5a0c', '#ffcf5c', '#fff3b8', '#fffaf0', ['digit', 'page', 'spark']),
    digits: ['5', '12', '18', '23', '33', '2021', '16', '11'],
  },
  s102: {
    kicker: 'JACKPOT IS JUST ANOTHER DAY',
    pattern: 'rays',
    calm: mood('#fff0e4', '#ffd6dc', '#ffffff', '#ff5a6e', '#5a2430', ['paw', 'star', 'confetti'], { light: true }),
    hot: mood('#3a0a10', '#b0202c', '#ffcf5c', '#fff3b8', '#fffaf0', ['ticket', 'confetti', 'coin']),
    gold: mood('#2a1403', '#a8600a', '#ffd85c', '#fff6c2', '#fffbef', ['ball', 'coin', 'ticket']),
    ballRange: 38,
  },
};

const moodOf = { tease: 'calm', proposal: 'calm', intro: 'calm', dance: 'hot', rally: 'hot', wedding: 'hot', jackpot: 'gold' };

export function styleFor(songId) {
  return pvStyles[songId] ?? pvStyles.s023;
}

export function moodFor(style, action) {
  return style[moodOf[action] ?? 'calm'];
}

export function moodName(action) {
  return moodOf[action] ?? 'calm';
}
