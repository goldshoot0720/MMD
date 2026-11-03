// Keep source lyrics and timings intact; remove punctuation only when drawing.
// Unicode punctuation covers Chinese, Latin and Japanese marks, including curly
// apostrophes and full-width brackets. Kana length marks and artwork stay intact.
export const withoutPunctuation = text => String(text).replace(/\p{P}/gu, '');

export const fillText = (ctx, text, ...args) => ctx.fillText(withoutPunctuation(text), ...args);
export const strokeText = (ctx, text, ...args) => ctx.strokeText(withoutPunctuation(text), ...args);
export const measureText = (ctx, text) => ctx.measureText(withoutPunctuation(text));
