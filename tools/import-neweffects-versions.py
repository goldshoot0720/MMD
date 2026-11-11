#!/usr/bin/env python3
"""Import the nine PV families and their four independently timed language versions.

Reads local NewEffects files without modifying that checkout. MP3s and captions are
snapshotted with hashes; local-only or modified source files are recorded explicitly.
Run: python -X utf8 tools/import-neweffects-versions.py D:/CODE/NewEffects
"""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FAMILIES = [
    ('wedding', '最瞎結婚理由', 'wedding'),
    ('s023', '鋒塗力百年夢', 'fengtuli'),
    ('s024', '水電進化 Show', 'plumbing-evolution'),
    ('s026', '喵布布本喵掉的毛', 'bubu-fur'),
    ('s027', '鋒兄的傳奇人生', 'feng-legend'),
    ('s028', '塗哥水電王子爆紅', 'plumbing-prince'),
    ('s062', '鋒兄進化 Show！🔥', 'evolution'),
    ('s101', '我與國中畢業紀念冊的對話', 'yearbook'),
    ('s102', '統一發票頭獎得主鋒兄威力彩頭獎得主塗哥', None),
]
LANGUAGES = [('zh', '中文'), ('en', '英文'), ('ja', '日文'), ('yue', '粵文')]
STAMP = re.compile(r'(\d+):(\d{2}):(\d{2})[,.](\d{3})')

def timestamp(text):
    h, m, s, ms = map(int, STAMP.fullmatch(text.strip()).groups())
    return round(h * 3600 + m * 60 + s + ms / 1000, 3)

def parse_srt(text, include_translation=False):
    cues = []
    for block in re.split(r'\r?\n\s*\r?\n', text.strip()):
        lines = block.splitlines()
        if len(lines) < 3:
            raise ValueError('Incomplete SRT block')
        start, end = [timestamp(t) for t in lines[1].split('-->')]
        lyric = lines[2].strip()
        assert lyric and end > start >= 0
        assert not cues or start > cues[-1]['time']
        cue = {'time': start, 'end': end, 'text': lyric}
        if include_translation and (translation := ' '.join(line.strip() for line in lines[3:] if line.strip())):
            cue['translation'] = translation
        cues.append(cue)
    assert cues
    return cues

def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def git_output(source, *args):
    return subprocess.run(['git', '-C', str(source), *args], capture_output=True, text=True, encoding='utf-8')

def main(source):
    source = pathlib.Path(source).resolve()
    revision = git_output(source, 'rev-parse', 'HEAD').stdout.strip()
    target = ROOT / 'public/audio'
    target.mkdir(exist_ok=True)
    entries = []
    audit = []
    for number, (base_id, source_title, ref) in enumerate(FAMILIES, 1):
        for lang, label in LANGUAGES:
            stem = source_title + (f'({label}歌詞)' if lang != 'zh' else '')
            audio = source / (stem + '.mp3')
            subtitle = source / (stem + '.srt')
            if not audio.is_file() or not subtitle.is_file():
                raise FileNotFoundError(f'Missing source: {stem}')
            cues = parse_srt(subtitle.read_text(encoding='utf-8-sig'), include_translation=lang in ('en', 'ja'))
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(audio)]))
            duration = float(probe['format']['duration'])
            assert cues[-1]['end'] <= duration + .1, stem
            omitted = []
            section_ids = None
            if ref:
                folder = source / 'assets/ref' / ref
                lyrics_file = folder / f'lyrics-{lang}.txt'
                timing_file = folder / f'timings-{lang}.json'
                raw = lyrics_file.read_text(encoding='utf-8-sig')
                sections = re.split(r'\n\s*\n', raw.strip())
                original = []
                line_sections = []
                for section, part in enumerate(sections):
                    for line in part.splitlines():
                        if line.strip():
                            original.append(line.strip())
                            line_sections.append(section)
                timing = json.loads(timing_file.read_text(encoding='utf-8-sig'))
                assert len(timing['cues']) == len(cues), stem
                assert abs(timing['duration'] - duration) < .15, stem
                omitted = timing.get('omitted', [])
                for cue, mark in zip(cues, timing['cues']):
                    assert cue['text'] == original[mark['line'] - 1], (stem, cue['text'])
                    assert abs(cue['time'] - mark['start']) < .002, stem
                if len(sections) > 1:
                    section_ids = [line_sections[c['line'] - 1] for c in timing['cues']]
                readme = (folder / 'README.md').read_text(encoding='utf-8-sig')
                row = next((line for line in readme.splitlines() if re.match(r'\|\s*' + label + r'\s*\|', line)), '')
                url = re.search(r'https://suno.com/s/[A-Za-z0-9]+', row)
                source_url = url.group() if url else None
            else:
                # Japanese sings the parent line once more at the end of acts 2 and 4.
                counts = (6, 5, 6, 5) if lang == 'ja' else (6, 4, 6, 4)
                assert len(cues) == sum(counts)
                section_ids = [section for section, count in enumerate(counts) for _ in range(count)]
                source_url = {'en': 'https://suno.com/s/NNjWp4nInpeloTf5', 'ja': 'https://suno.com/s/xb8brpvBy23lIyfx', 'yue': 'https://suno.com/s/a0XTF9CAMxLNOtBc'}.get(lang)
            for i, cue in enumerate(cues):
                if section_ids is not None:
                    cue['section'] = section_ids[i]
            song_id = base_id if lang == 'zh' else f'{base_id}-{lang}'
            destination = target / f'{song_id}.mp3'
            codec = next(s['codec_name'] for s in probe['streams'] if s['codec_type'] == 'audio')
            original_hash = sha256(audio)
            if not destination.exists() or sha256(destination) != original_hash:
                if codec == 'mp3' and probe['format']['format_name'] == 'mp3':
                    shutil.copyfile(audio, destination)
                else:
                    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(audio), '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', str(destination)], check=True)
            local_paths = [audio.name, subtitle.name]
            if ref:
                local_paths += [f'assets/ref/{ref}/lyrics-{lang}.txt', f'assets/ref/{ref}/timings-{lang}.json']
            source_files = []
            for name in local_paths:
                committed = git_output(source, 'rev-parse', f'HEAD:{name}')
                current = git_output(source, 'hash-object', '--', name)
                source_files.append({'path': name, 'sha256': sha256(source / name), 'committed': committed.returncode == 0 and committed.stdout.strip() == current.stdout.strip()})
            entry = {'id': song_id, 'baseId': base_id, 'pvNumber': number, 'language': lang, 'languageLabel': label, 'audio': f'/audio/{song_id}.mp3', 'duration': duration, 'sourceUrl': source_url, 'cues': cues}
            entries.append(entry)
            audit.append({'id': song_id, 'sourceRevision': revision, 'sourceFiles': source_files, 'audioSha256': sha256(destination), 'duration': duration, 'cueCount': len(cues), 'omitted': omitted})
            print(f'{song_id}: {len(cues)} cues, {duration:.2f}s', flush=True)
    output = '// Generated by tools/import-neweffects-versions.py; preserve the source lyrics and independent SRT timings.\n'
    output += 'export const newEffectsVersions = ' + json.dumps(entries, ensure_ascii=False, indent=2) + ';\n'
    (ROOT / 'src/new-effects-data.js').write_text(output, encoding='utf-8')
    (ROOT / 'verification/neweffects-import.json').write_text(json.dumps({'repository': 'https://github.com/goldshoot0720/NewEffects', 'sourceRevision': revision, 'versions': audit}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Imported 9 families / 36 independently timed versions.', flush=True)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / 'NewEffects')
