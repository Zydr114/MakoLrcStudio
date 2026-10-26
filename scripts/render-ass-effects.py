"""Render generated local ASS evidence with FFmpeg/libass (no network)."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import time

root = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/mako-ass-effects')
manifest = json.loads((root / 'manifest.json').read_text())
presets = ['none', 'soft', 'neon', 'outline', 'float', 'bounce', 'sweep', 'particles']


def ffmpeg(args):
    start = time.monotonic()
    p = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2', *args], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return round(time.monotonic() - start, 3)


def render(sample):
    name = sample['name']
    width, height = sample['width'], sample['height']
    colors = ['0x182438', '0xe8e9e4'] if name in presets else ['0x182438']
    rows = []
    for color in colors:
        bg = 'dark' if color == '0x182438' else 'light'
        path = root / f'{name}-{bg}.mp4'
        # Complete clips for every preset, boundary clips, and stress throughput.
        if name in presets or name.endswith('-edge') or name.endswith('-dense'):
            seek = '6' if name.endswith('-edge') else '0'
            seconds = 10 if name in presets else 12 if name.endswith('-edge') else 30
            elapsed = ffmpeg(['-f', 'lavfi', '-i', f'color=c={color}:s={width}x{height}:r=30:d={seconds}',
                              '-vf', f"setpts=PTS+{seek}/TB,ass={root / (name + '.ass')},setpts=PTS-STARTPTS",
                              '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p', '-y', str(path)])
            rows.append({'name':name, 'background':bg, 'seconds':seconds, 'wallSeconds':elapsed, 'realtimeFactor':round(seconds/elapsed,2)})
        at = '10.08' if name.endswith('-edge') else '1.15'
        ffmpeg(['-f','lavfi','-i',f'color=c={color}:s={width}x{height}:r=30:d={float(at)+0.1}',
                '-vf',f"ass={root / (name + '.ass')}", '-ss', at, '-frames:v','1','-update','1','-y',str(root / f'{name}-{bg}.png')])
    return rows


with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    rows = []
    for result in pool.map(render,manifest):
        rows.extend(result)
(root / 'render-metrics.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))

# Contact sheets retain full frame geometry; closer crops are also available.
from PIL import Image, ImageDraw
for bg in ['dark','light']:
    canvas = Image.new('RGB',(1280,800),'#101826')
    for i,name in enumerate(presets):
        x,y=i%4*320,i//4*400
        frame=Image.open(root/f'{name}-{bg}.png')
        canvas.paste(frame.resize((320,180)),(x,y+22))
        crop=frame.crop((70,720,850,1060)).resize((320,150))
        canvas.paste(crop,(x,y+210))
        ImageDraw.Draw(canvas).text((x+8,y+4),name,fill='white')
    canvas.save(root/f'contact-{bg}.png')
print(f'Rendered {len(manifest)} ASS samples; {len(rows)} clips; evidence: {root}')
