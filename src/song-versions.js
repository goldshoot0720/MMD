import { newEffectsVersions } from './new-effects-data.js';
import { luckyTranslations } from './lucky-translations.js';

export const languageLabels = { zh: '中文', en: '英文', ja: '日文', yue: '粵文' };
const chapterLabel = (language, number) => ({
  zh: `第 ${number} 幕`, en: `Part ${number}`, ja: `第${number}章`, yue: `第 ${number} 幕`,
})[language];
const endings = {
  zh: ['— 謝幕 · 感謝欣賞 —', '演出結束'],
  en: ['— Thank You · See You Again —', 'Performance complete'],
  ja: ['— ご視聴ありがとうございました —', '終演'],
  yue: ['— 多謝欣賞 · 下次再見 —', '演出完滿結束'],
};
const bannerTitles = {
  wedding: { en: 'The Wildest Reason to Marry', ja: 'とんでもない結婚の理由', yue: '最離譜嘅結婚理由' },
  s023: { en: 'Feng Tu Power · A Hundred-Year Dream', ja: 'フェントゥパワー · 百年の夢', yue: '鋒塗力 · 百年夢' },
  s024: { en: 'Plumbing Evolution Show', ja: '水道と電気の進化ショー', yue: '水電進化 Show' },
  s026: { en: 'Bu Bu the Cat · Every Strand of Fur', ja: 'ブブの抜け毛物語', yue: '喵布布 · 本喵甩嘅毛' },
  s027: { en: 'The Legendary Life of Brother Feng', ja: 'フォン兄の伝説人生', yue: '鋒兄嘅傳奇人生' },
  s028: { en: 'Tu · The Plumbing Prince Goes Viral', ja: 'トゥ兄 · 水電王子の大ブレイク', yue: '塗哥 · 水電王子爆紅' },
  s062: { en: 'Brother Feng · Evolution Has No Limits', ja: 'フォン兄 · 進化に限界はない', yue: '鋒兄 · 進化冇上限' },
  s101: { en: 'A Conversation with My Yearbook', ja: '卒業アルバムとの対話', yue: '我同畢業紀念冊嘅對話' },
};

const localizedCastNames = {
  '喵布布': { en: 'Bu Bu', ja: 'ブブ' },
  '咕咕嘎嘎': { en: 'Gugugaga', ja: 'ググガガ' },
  '鋒兄': { en: 'Feng', ja: 'フェン' },
  '塗哥': { en: 'Tu', ja: 'トゥ' },
  'GPT 娘': { zh: 'ＧＰＴ娘', en: 'ＧＰＴ Ｇirl', ja: 'GPTむすめ', yue: 'ＧＰＴ娘' },
  '牙妹': { en: 'Yamei', ja: 'ヤーメイ' },
  '小塗': { en: 'Tu', ja: 'トゥ' },
  '魚妹': { en: 'Yumei', ja: 'ユーメイ' },
  '喵白白': { en: 'Miabyby', ja: 'ミャオバイバイ' },
  '鯨魚娘': { en: 'Whale Girl', ja: 'クジラ娘' },
};

export function buildVersions(bases) {
  return newEffectsVersions.map(record => {
    const base = bases.find(song => song.id === record.baseId);
    if (!base) throw new Error(`Missing PV family: ${record.baseId}`);
    const authored = luckyTranslations.find(song => song.id === record.id) ?? base;
    const language = record.language;
    const count = base.chapters.length;
    const hasSections = record.cues.every(cue => Number.isInteger(cue.section));
    const sectionCount = hasSections ? Math.max(...record.cues.map(cue => cue.section)) + 1 : 0;
    const baseLines = base.chapters.flatMap((chapter, i) => chapter.lines.map(() => i));
    const runs = [];
    record.cues.forEach((cue, i) => {
      const section = hasSections
        ? sectionCount > count ? Math.floor(cue.section * count / sectionCount) : cue.section
        : baseLines[Math.min(baseLines.length - 1, Math.floor(i * baseLines.length / record.cues.length))];
      if (runs.at(-1)?.section !== section) runs.push({ section, cues: [] });
      runs.at(-1).cues.push(cue);
    });
    const chapters = runs.map((run, i) => {
      const templateIndex = Math.round(i * (authored.chapters.length - 1) / Math.max(1, runs.length - 1));
      const template = authored.chapters[templateIndex];
      const keepCopy = language === 'zh' || base.id === 's102';
      return {
        ...template,
        title: keepCopy ? template.title : chapterLabel(language, i + 1),
        prop: keepCopy ? template.prop : template.prop ? `♫ ${bannerTitles[base.id][language]}` : undefined,
        lines: run.cues.map(cue => cue.text),
      };
    });
    return {
      ...authored,
      id: record.id,
      baseId: base.id,
      pvNumber: record.pvNumber,
      language,
      languageLabel: record.languageLabel,
      pvCastNames: authored.cast.map(({ name }) => localizedCastNames[name]?.[language] ?? name),
      baseTitle: base.title,
      baseTagline: base.tagline,
      title: language === 'zh' ? base.title : `${base.title}(${record.languageLabel}歌詞)`,
      subtitle: `${base.subtitle} · ${record.languageLabel}版`,
      tagline: language === 'zh' ? base.tagline : record.cues[0].text,
      sourceUrl: record.sourceUrl ?? authored.sourceUrl,
      audio: record.audio,
      duration: record.duration,
      chapters,
      times: record.cues.map(cue => cue.time),
      ends: record.cues.map(cue => cue.end),
      translations: record.cues.some(cue => cue.translation) ? record.cues.map(cue => cue.translation) : undefined,
      outro: language === 'zh' || base.id === 's102' ? authored.outro : endings[language][0],
      ending: base.id === 's102' && authored.ending ? authored.ending : endings[language][1],
    };
  });
}

export function groupSongs(songs) {
  const groups = new Map();
  for (const song of songs) {
    if (!groups.has(song.baseId)) groups.set(song.baseId, {
      id: song.baseId, number: song.pvNumber, title: song.baseTitle, tagline: song.baseTagline, variants: [],
    });
    groups.get(song.baseId).variants.push(song);
  }
  return [...groups.values()];
}
