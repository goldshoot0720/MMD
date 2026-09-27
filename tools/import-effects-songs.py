# -*- coding: utf-8 -*-
"""Import songs from the goldshoot0720/Effects repo into the lyric theatre.

Reads Effects/data/song/<id>.js (timed lyrics, sections, analysed BPM),
copies Effects/audio/<id>.mp3 to public/audio/, and writes src/effects-songs.js.
Chapters, stage actions and the four-person cast are authored below; each
chapter lists the Effects section indices it covers.

Run:  python3 tools/import-effects-songs.py /path/to/Effects
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Model ids (src/models.js): 5 牙妹 6 咕咕嘎嘎 7 喵白白 8 鯨魚娘 9 魚妹 10 鋒兄 11 塗哥 12 喵布布
C = {'鋒兄': 10, '塗哥': 11, '牙妹': 5, '魚妹': 9, '咕咕嘎嘎': 6, '喵白白': 7, '鯨魚娘': 8, '喵布布': 12}

# Slot 2 is the lead: 'jackpot' chapters bring slots 2–3 to centre stage.
SONGS = {
    's023': {
        'cast': ['鋒兄', '喵布布', '塗哥', '喵白白'],
        'outro': '— 謝幕 · 百年夢一起前進 —',
        'chapters': [
            ('主歌一 · 一張桌一枝筆', 'tease', [0]),
            ('副歌 · 鋒塗力', 'rally', [1]),
            ('主歌二 · 職人的堅固', 'tease', [2]),
            ('副歌 · 明天的福氣', 'rally', [3]),
            ('橋段 · 一個鋒一個塗', 'tease', [4]),
            ('終章 · 百年企業', 'rally', [5], '✦ 鋒塗力 · 百年企業 ✦'),
        ],
    },
    's024': {
        'cast': ['鋒兄', '咕咕嘎嘎', '塗哥', '鯨魚娘'],
        'outro': '— 謝幕 · 水電進化 Show —',
        'chapters': [
            ('開場 · 台北有大家真好', 'rally', [0]),
            ('主歌一 · 水電進化到樂團', 'tease', [1, 2]),
            ('主歌二 · 團員敢唱', 'tease', [3, 4]),
            ('副歌 · 命運像 debug', 'rally', [5], '♪ 從水電進化到樂團 ♪'),
            ('主歌三 · 二零四零的夜', 'tease', [6]),
            ('最後副歌 · 嗨到早朝', 'rally', [7, 8], '♪ 台北有大家真好 ♪'),
            ('尾聲 · 進化論', 'rally', [9, 10, 11]),
        ],
    },
    's026': {
        'cast': ['喵白白', '鋒兄', '喵布布', '塗哥'],
        'outro': '— 謝幕 · 排隊朝拜本喵 —',
        'chapters': [
            ('登場 · 人類聽好', 'tease', [0]),
            ('副歌 · 本喵掉的毛', 'rally', [1, 2], '🐾 本喵原廠 · 一根一根都是寶 🐾'),
            ('主歌 · 本喵原廠', 'tease', [3]),
            ('副歌 · 深呼吸都抖', 'rally', [4, 5], '🐾 喵布布本喵掉的毛 🐾'),
            ('橋段 · 向上朝聖', 'tease', [6]),
            ('最後通牒 · 排隊朝拜', 'rally', [7]),
        ],
    },
    's027': {
        'cast': ['塗哥', '牙妹', '鋒兄', '喵布布'],
        'outro': '— 謝幕 · 幸運台灣 —',
        'chapters': [
            ('序 · 傳奇人生', 'rally', [0]),
            ('三十七歲 · 頭獎連發', 'jackpot', [1], '🎟 發票 × 威力彩 × 大樂透 · 頭獎！'),
            ('榜首 · 創業', 'tease', [2]),
            ('五十二歲 · 市府之路', 'tease', [3]),
            ('五十四歲 · 百億市長', 'jackpot', [4], '✦ 鋒兄發大財 ✦'),
            ('六十三歲 · 一兆總統', 'jackpot', [5], '✦ 幸運台北 · 幸運台灣 ✦'),
            ('終章 · 從榜首到總統', 'rally', [6]),
        ],
    },
    's028': {
        'cast': ['鋒兄', '咕咕嘎嘎', '塗哥', '鯨魚娘'],
        'outro': '— 謝幕 · 水電王子爆紅 —',
        'chapters': [
            ('序 · 二零零四年六月', 'tease', [0, 1]),
            ('台中小吃店 · 太陽餅', 'tease', [2, 3]),
            ('鋒兄歷史小學堂', 'tease', [4, 5]),
            ('同學是副市長？', 'tease', [6, 7, 8]),
            ('水電情 · 遠房親戚', 'tease', [9, 10, 11]),
            ('現象級 · 水電王子', 'rally', [12, 13], '📺 電視劇 · 小說 · 電影'),
            ('學術引用 · 論文', 'rally', [14, 15], '🎓 碩博士論文引用'),
            ('爆紅 · 三百三十三億', 'jackpot', [16], '💰 鋒兄 333 億 · 塗哥 3 億'),
        ],
    },
    's062': {
        'cast': ['塗哥', '鯨魚娘', '鋒兄', '咕咕嘎嘎'],
        'outro': '— 謝幕 · 進化沒有上限 —',
        'chapters': [
            ('開場 · 台北有鋒兄真好', 'rally', [0]),
            ('主歌一 · 榜首傳說', 'tease', [1]),
            ('主歌二 · 代理市長', 'tease', [2]),
            ('主歌三 · 全場大合唱', 'rally', [3]),
            ('橋段 · evolution', 'tease', [4]),
            ('副歌 · 鋒兄進化 Show', 'rally', [5], '⚡ 鋒兄進化 Show！ ⚡'),
        ],
    },
    's101': {
        'cast': ['喵白白', '鯨魚娘', '鋒兄', '喵布布'],
        'outro': '— 謝幕 · 排列組合的對話 —',
        'chapters': [
            ('序 · 2021 年 33 歲', 'tease', [0]),
            ('排列組合 · 四個班', 'tease', [1, 2, 3]),
            ('紀念冊的呼喚', 'tease', [4], '📖 國中畢業紀念冊'),
            ('考試 · 榜首', 'jackpot', [5, 6], '📝 真的考到榜首了耶'),
            ('5 12 · 職等之謎', 'tease', [7]),
            ('其他組 · 5 18 · 5 23', 'tease', [8, 9]),
            ('12 18 · 市長屆數', 'tease', [10, 11, 12]),
            ('18 23 · 總統', 'rally', [13, 14]),
            ('尾聲 · 以上是對話', 'tease', [15]),
        ],
    },
    's102': {
        'cast': ['鋒兄', '喵布布', '塗哥', '牙妹'],
        'outro': '— 謝幕 · 中獎是日常 —',
        'chapters': [
            ('招財喵 · 生日祝福', 'rally', [0], '🎂 鋒兄三十七歲生日快樂'),
            ('塗哥選號 · 中獎', 'jackpot', [1], '🎟 威力彩頭獎 · 分紅兩千零二十五萬'),
            ('雙家到場 · 見證', 'tease', [2]),
            ('再唱一次 · 幸福播撒', 'rally', [3], '🐾 招財喵布布把幸福播撒 🐾'),
        ],
    },
}
THEMES = {'tease': 'blue', 'rally': 'rose', 'jackpot': 'violet'}

# Story gestures per chapter (see src/dance.js): each 8-beat phrase takes the next move.
MOVES = {
    's023': [  # 一張桌一枝筆 → 職人 → 百年企業
        ['write', 'think', 'point', 'side'],
        ['cheer', 'point', 'march', 'reach'],
        ['wrench', 'write', 'heel', 'cross'],
        ['cheer', 'disco', 'kick', 'point'],
        ['point', 'side', 'heart', 'march'],
        ['cheer', 'royal', 'reach', 'bow'],
    ],
    's024': [  # 水電工變樂團
        ['cheer', 'mic', 'disco', 'kick'],
        ['wrench', 'guitar', 'side', 'guitar'],
        ['mic', 'point', 'guitar', 'cross'],
        ['guitar', 'cheer', 'shuffle', 'disco'],
        ['wrench', 'mic', 'twist', 'point'],
        ['cheer', 'guitar', 'mic', 'reach'],
        ['guitar', 'cheer', 'bow'],
    ],
    's026': [  # 傲嬌本喵
        ['point', 'paw', 'royal', 'heel'],
        ['paw', 'twist', 'paw', 'disco'],
        ['royal', 'paw', 'point', 'curl'],
        ['paw', 'shuffle', 'paw', 'reach'],
        ['royal', 'think', 'paw', 'side'],
        ['point', 'paw', 'royal', 'bow'],
    ],
    's027': [  # 頭獎 → 榜首 → 市長 → 總統
        ['royal', 'point', 'cheer', 'march'],
        ['cash', 'cheer', 'cash', 'kick'],
        ['write', 'think', 'point', 'cheer'],
        ['royal', 'point', 'side', 'march'],
        ['cash', 'royal', 'cheer', 'disco'],
        ['royal', 'cash', 'cheer', 'reach'],
        ['royal', 'cheer', 'point', 'bow'],
    ],
    's028': [  # 塗哥的旁白故事
        ['book', 'write', 'think', 'groove'],
        ['think', 'point', 'heel', 'side'],
        ['book', 'think', 'point', 'wave'],
        ['think', 'point', 'cross', 'royal'],
        ['wrench', 'think', 'point', 'twist'],
        ['royal', 'cheer', 'wrench', 'disco'],
        ['book', 'write', 'point', 'reach'],
        ['cash', 'cheer', 'cash', 'bow'],
    ],
    's062': [  # 榜首進化到市長的演唱會
        ['cheer', 'mic', 'disco', 'kick'],
        ['write', 'point', 'mic', 'side'],
        ['royal', 'mic', 'point', 'cross'],
        ['mic', 'cheer', 'shuffle', 'reach'],
        ['point', 'think', 'twist', 'disco'],
        ['cheer', 'royal', 'mic', 'bow'],
    ],
    's101': [  # 和畢業紀念冊對話、排列組合
        ['book', 'think', 'groove', 'heel'],
        ['think', 'point', 'book', 'side'],
        ['book', 'wave', 'think', 'point'],
        ['write', 'cheer', 'cheer', 'kick'],
        ['think', 'point', 'book', 'cross'],
        ['book', 'point', 'think', 'heel'],
        ['think', 'royal', 'point', 'side'],
        ['royal', 'cheer', 'point', 'reach'],
        ['book', 'bow'],
    ],
    's102': [  # 招財喵、生日、中獎
        ['paw', 'cheer', 'heart', 'clap'],
        ['write', 'cash', 'cheer', 'cash'],
        ['royal', 'heart', 'clap', 'bow'],
        ['cash', 'paw', 'cheer', 'reach'],
    ],
}


def load(effects, sid):
    text = open(os.path.join(effects, 'data', 'song', sid + '.js'), encoding='utf-8').read()
    return json.loads(re.search(r'\]=(\{.*\})\s*;?\s*$', text, re.S).group(1))


def main(effects):
    out = []
    for sid, spec in SONGS.items():
        data = load(effects, sid)
        lines = data['lines']
        # Lines sharing a timestamp would never be shown; spread them out.
        times = [l['t'] for l in lines]
        for i in range(1, len(times)):
            if times[i] <= times[i - 1]:
                nxt = times[i + 1] if i + 1 < len(times) else times[i - 1] + 2
                times[i] = round((times[i - 1] + nxt) / 2, 2)
        chapters, covered = [], []
        for chapter in spec['chapters']:
            title, action, sections = chapter[:3]
            picked = [i for i, l in enumerate(lines) if l['sec'] in sections]
            covered += picked
            c = {'title': title, 'theme': THEMES[action], 'action': action,
                 'lines': [lines[i]['text'] for i in picked]}
            if len(chapter) > 3:
                c['prop'] = chapter[3]
            c['moves'] = MOVES[sid][len(chapters)]
            chapters.append(c)
        assert covered == list(range(len(lines))), f'{sid}: chapters must cover every line in order'
        assert len(MOVES[sid]) == len(chapters), f'{sid}: one move list per chapter'
        shutil.copyfile(os.path.join(effects, 'audio', sid + '.mp3'),
                        os.path.join(ROOT, 'public', 'audio', sid + '.mp3'))
        out.append({
            'id': sid,
            'title': data['title'],
            'subtitle': data['cast'],
            'tagline': data['tagline'],
            'audio': f'/audio/{sid}.mp3',
            'bpm': round(data['analysis']['bpm']),
            'outro': spec['outro'],
            'cast': [{'name': n, 'modelId': C[n]} for n in spec['cast']],
            'couples': False,
            'chapters': chapters,
            'times': times,
        })
        print(sid, data['title'], len(lines), 'lines', len(chapters), 'chapters')
    with open(os.path.join(ROOT, 'src', 'effects-songs.js'), 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/import-effects-songs.py from goldshoot0720/Effects. Do not edit by hand.\n')
        f.write('export const effectsSongs = ')
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(';\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'Effects'))
