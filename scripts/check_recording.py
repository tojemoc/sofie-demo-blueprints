#!/usr/bin/env python3
"""
check_recording.py - regression check for the SPRAVY 360s Sofie blueprints.

Takes one OBS recording of the multiview (program window + camera/bus windows)
and the CasparCG log written during that recording. Prints PASS / FAIL / WARN
per check and exits 1 if anything FAILs.

  python3 check_recording.py --video 2026-09-30_13-23-12.mp4 --log caspar_2026-09-30.log

Requires: python3, numpy, ffmpeg + ffprobe on PATH.

LOG CHECKS (only the Caspar session that was running during the recording)
  FAIL  PLAY 2-110 / 2-111 "route://..." beyond the allowed baseline count
        (dual always-live routes: cuts must be MIXER opacity/volume only)
  FAIL  CLEAR 3-110 / CLEAR 4-110            (sticky bg_loop must never be cleared)
  FAIL  LOADBG 2-205..208 "EMPTY"            (evicts the wipe preload)
  FAIL  PLAY 2-205..208 "wipes/..."          (full-path PLAY = cold producer, not a hot promote)
  WARN  "Check syntax" errors and LOAD commands with SEEK > int32
  INFO  "File not found" count; per-wipe PLAY form and measured first-frame delay

RECORDING CHECKS
  FAIL  black frames in the program window (with the nearest Caspar commands)
  FAIL  frozen wipe card: the same bright frame held for >= --min-frozen frames
        after a wipe PLAY (the paused preload showing before the wipe plays).
        LIMITS: it only sees a card that is pixel-identical frame to frame, so a wipe
        over MOVING video can slip through (in the 2026-09-30 recording only 4 of 9
        cold wipes were flagged). PASS here does not prove the wipe was hot.
        The log check "wipe started cold" is the authoritative one.

CALIBRATION - read this before trusting the video checks
  * Screen geometry defaults are for the OBS multiview used so far: program
    window in the lower-left, 1920x1080 canvas. Change --prog-crop / --logo-crop
    (ffmpeg crop syntax w:h:x:y) if the layout changes.
  * The OBS clock and the Caspar log clock differ by a few seconds. The script
    finds the offset itself by matching hard-cut spikes in the video to cut
    commands in the log. If it reports low confidence, pass --offset SECONDS
    (video_time = log_time - video_start + offset).
  * Thresholds were tuned on two recordings only.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

import numpy as np

LINE = re.compile(r'^\[(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d+)\] \[(\w+)\]\s*(.*)$')
RECV = re.compile(r'^Received message from [\d.]+: REQ \w+ (.*)$')
BANNER = 'Starting CasparCG Video and Graphics Playout Server'
EPOCH = datetime(1970, 1, 1)


# ----------------------------------------------------------------------------- log
def to_s(dt):
    return (dt - EPOCH).total_seconds()


def parse_log(path):
    """[(epoch_seconds, level, text)] in file order; literal \\r\\n suffixes stripped."""
    out = []
    with open(path, errors='replace') as fh:
        for raw in fh:
            m = LINE.match(raw.rstrip('\r\n'))
            if not m:
                continue
            d, hh, mm, ss, lvl, txt = m.groups()
            ts = to_s(datetime.strptime(d, '%Y-%m-%d')) + int(hh) * 3600 + int(mm) * 60 + float(ss)
            out.append((ts, lvl, txt.replace('\\r\\n', '').rstrip()))
    return out


def pick_session(entries, video_start):
    """Entries of the Caspar session that was running when the recording started."""
    idx = [i for i, e in enumerate(entries) if BANNER in e[2]]
    if not idx:
        return entries, None
    chosen = idx[-1]
    for i in idx:
        if entries[i][0] <= video_start + 5:
            chosen = i
    nxt = [i for i in idx if i > chosen]
    end = nxt[0] if nxt else len(entries)
    return entries[chosen:end], entries[chosen][0]


def commands(session):
    """[(ts, cmd_text)] for AMCP commands Caspar actually received."""
    out = []
    for ts, lvl, txt in session:
        m = RECV.match(txt)
        if m:
            out.append((ts, m.group(1)))
    return out


def clock(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime('%H:%M:%S.%f')[:-3]


def log_checks(session, cmds, allowed_route_plays):
    res = []

    def add(status, name, detail, evidence=None):
        res.append({'status': status, 'name': name, 'detail': detail, 'evidence': evidence or []})

    route_plays = [(t, c) for t, c in cmds if re.match(r'PLAY 2-11[01] "route://', c)]
    if len(route_plays) > allowed_route_plays:
        add('FAIL', 'route producers recreated',
            f'{len(route_plays)} PLAY 2-11x route:// (allowed {allowed_route_plays}, the baseline)',
            [f'{clock(t)} {c[:90]}' for t, c in route_plays[allowed_route_plays:allowed_route_plays + 5]])
    else:
        add('PASS', 'route producers recreated', f'{len(route_plays)} PLAY 2-11x route:// (allowed {allowed_route_plays})')

    all_clears = [t for t, c in cmds if re.match(r'CLEAR \d-\d+\b', c)]

    def teardown(t):  # end-of-rundown / reset: many CLEARs across layers within a fraction of a second
        return sum(1 for x in all_clears if abs(x - t) <= 0.3) >= 8

    clr_all = [(t, c) for t, c in cmds if re.match(r'CLEAR [34]-110\b', c)]
    clr = [(t, c) for t, c in clr_all if not teardown(t)]
    ignored = len(clr_all) - len(clr)
    add('FAIL' if clr else 'PASS', 'sticky bg_loop cleared',
        f'{len(clr)} x CLEAR 3-110/4-110' + (f' ({ignored} more ignored: part of an end-of-rundown CLEAR burst)' if ignored else ''),
        [f'{clock(t)} {c}' for t, c in clr[:5]])

    emp = [(t, c) for t, c in cmds if re.match(r'LOADBG 2-20[5-8] "EMPTY"', c)]
    add('FAIL' if emp else 'PASS', 'wipe preload evicted',
        f'{len(emp)} x LOADBG 2-205..208 "EMPTY"', [f'{clock(t)} {c}' for t, c in emp[:5]])

    full = [(t, c) for t, c in cmds if re.match(r'PLAY 2-20[5-8] "wipes/', c)]
    bare = [(t, c) for t, c in cmds if re.match(r'PLAY 2-20[5-8]\s*$', c)]
    add('FAIL' if full else 'PASS', 'wipe started cold',
        f'{len(full)} full-path PLAY 2-205..208 "wipes/..." vs {len(bare)} bare PLAY (hot promote)',
        [f'{clock(t)} {c[:100]}' for t, c in full[:6]])

    syn = sum(1 for ts, l, x in session if l == 'error' and 'Check syntax' in x)
    bigseek = [(t, c) for t, c in cmds if re.search(r'\bSEEK \d{10,}', c)]
    if syn or bigseek:
        add('WARN', 'AMCP syntax errors',
            f'{syn} "Check syntax" errors; {len(bigseek)} LOAD commands with SEEK > int32 '
            '(SEEK looks epoch-derived, so Caspar rejects the command)',
            [f'{clock(t)} {c[:100]}' for t, c in bigseek[:3]])
    else:
        add('PASS', 'AMCP syntax errors', 'none')

    nf = sum(1 for ts, l, x in session if 'File not found' in x)
    add('INFO', 'File not found', f'{nf} lines')
    return res


def wipe_plays(session, cmds):
    """Each wipe start with its form and, for full-path PLAYs, the measured first-frame delay."""
    out = []
    for t, c in cmds:
        m = re.match(r'PLAY 2-(20[5-8])(?: "(wipes/\w+)")?', c)
        if not m:
            continue
        form = 'full-path' if m.group(2) else 'bare'
        delay = None
        if form == 'full-path':
            for ts, lvl, x in session:
                if t <= ts <= t + 1.5 and re.search(r'ffmpeg\[wipes/\w+\|0\.0000/[\d.]+\] Latency', x):
                    delay = ts - t
                    break
        out.append({'t': t, 'layer': m.group(1), 'form': form, 'first_frame_ms': None if delay is None else round(delay * 1000)})
    return out


# --------------------------------------------------------------------------- video
def probe_fps(video):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=r_frame_rate', '-of', 'csv=p=0', video], capture_output=True, text=True)
    num, den = r.stdout.strip().split('/')
    return float(num) / float(den)


def crop_wh(crop):
    w, h, _, _ = (int(v) for v in crop.split(':'))
    return w, h


def extract(video, prog_crop, logo_crop, tmp):
    pw, ph = crop_wh(prog_crop)
    lw, lh = crop_wh(logo_crop)
    PW, PH = 160, max(2, int(round(ph * 160 / pw / 2)) * 2)
    LW, LH = 170, 60
    prog, logo = os.path.join(tmp, 'prog.raw'), os.path.join(tmp, 'logo.raw')
    fc = (f'[0:v]split=2[a][b];'
          f'[a]crop={prog_crop},scale={PW}:{PH},format=gray[p];'
          f'[b]crop={logo_crop},scale={LW}:{LH},format=gray[l]')
    base = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-an', '-filter_complex', fc]
    outs = ['-map', '[p]', '-f', 'rawvideo', prog, '-map', '[l]', '-f', 'rawvideo', logo]
    for passthru in (['-fps_mode', 'passthrough'], ['-vsync', '0']):
        r = subprocess.run(base + passthru + outs, capture_output=True, text=True)
        if r.returncode == 0:
            break
    else:
        sys.exit('ffmpeg failed:\n' + r.stderr)
    P = np.fromfile(prog, dtype=np.uint8)
    L = np.fromfile(logo, dtype=np.uint8)
    n = min(P.size // (PW * PH), L.size // (LW * LH))
    return P[:n * PW * PH].reshape(n, PH, PW), L[:n * LW * LH].reshape(n, LH, LW)


def calibrate(P, fps, video_start, cmds, search):
    """Offset so that video_time = log_time - video_start + offset. Match cut commands to picture spikes."""
    f = P.astype(np.float32)
    d = np.zeros(len(f), dtype=np.float32)
    d[1:] = np.abs(f[1:] - f[:-1]).mean(axis=(1, 2))
    med = float(np.median(d))
    mad = float(np.median(np.abs(d - med))) + 1e-3
    spikes = np.where((d > med + 8 * mad) & (d > 6.0))[0]
    spike_t = spikes / fps
    cut_t = []
    for t, c in cmds:
        if re.match(r'PLAY 2-11[01] "route://', c) or re.match(r'MIXER 2-11[01] OPACITY [01]\b', c):
            if not cut_t or t - cut_t[-1] > 0.15:
                cut_t.append(t)
    cut_t = np.array(cut_t)
    if len(cut_t) == 0 or len(spike_t) == 0:
        return None, 0, len(cut_t)
    best = []
    for off in np.arange(-search, search, 0.01):
        vt = cut_t - video_start + off
        j = np.searchsorted(spike_t, vt)
        near = np.minimum(np.abs(spike_t[np.clip(j, 0, len(spike_t) - 1)] - vt),
                          np.abs(spike_t[np.clip(j - 1, 0, len(spike_t) - 1)] - vt))
        best.append(((near < 0.03).sum(), off))
    top = max(b[0] for b in best)
    tied = [o for s, o in best if s == top]
    return float(np.median(tied)), int(top), len(cut_t)


def black_runs(P, mean_thr, max_thr):
    """A black frame is uniformly black: low mean AND no bright pixel (a dark wipe or dim scene has both bright bits and a higher mean)."""
    flat = P.reshape(len(P), -1)
    m = flat.mean(axis=1)
    idx = np.where((m <= mean_thr) & (flat.max(axis=1) <= max_thr))[0]
    runs = []
    for i in idx:
        if runs and i == runs[-1][1] + 1:
            runs[-1][1] = i
        else:
            runs.append([int(i), int(i)])
    return runs, m


def frozen_run(L, f0, bright, still, pre=4, post=70):
    a, b = max(1, f0 - pre), min(len(L) - 1, f0 + post)
    seg = L[a - 1:b + 1].astype(np.float32)
    br = seg[1:].mean(axis=(1, 2))
    diff = np.abs(seg[1:] - seg[:-1]).mean(axis=(1, 2))
    ok = (diff < still) & (br > bright)
    best = cur = 0
    start = bstart = None
    for i, v in enumerate(ok):
        if v:
            if cur == 0:
                start = i
            cur += 1
            if cur > best:
                best, bstart = cur, start
        else:
            cur = 0
    return best + 1 if best else 0, (None if bstart is None else a + bstart - f0)


# -------------------------------------------------------------------------- report
def parse_video_start(path):
    m = re.search(r'(\d{4}-\d{2}-\d{2})[_ ](\d{2})-(\d{2})-(\d{2})', os.path.basename(path))
    if not m:
        sys.exit('Cannot read the recording start time from the file name; pass --video-start "YYYY-MM-DD HH:MM:SS"')
    return to_s(datetime.strptime(f'{m.group(1)} {m.group(2)}:{m.group(3)}:{m.group(4)}', '%Y-%m-%d %H:%M:%S'))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--video', required=True)
    ap.add_argument('--log', required=True)
    ap.add_argument('--video-start', help='"YYYY-MM-DD HH:MM:SS" (default: parsed from the OBS file name)')
    ap.add_argument('--offset', type=float, help='seconds; skip auto-calibration')
    ap.add_argument('--search', type=float, default=15.0, help='calibration search range, +-seconds')
    ap.add_argument('--prog-crop', default='1150:380:20:430', help='program window interior, no lower third (w:h:x:y)')
    ap.add_argument('--logo-crop', default='340:120:430:640', help='centre of the wipe, where the card sits (w:h:x:y)')
    ap.add_argument('--black-mean', type=float, default=6.0, help='black frame: mean gray level at or below this (real black measured 1.9)')
    ap.add_argument('--black-max', type=int, default=12, help='black frame: brightest pixel at or below this (real black measured 2)')
    ap.add_argument('--bright', type=float, default=60.0, help='brightness of a wipe card in the logo crop')
    ap.add_argument('--still', type=float, default=0.02, help='max frame-to-frame diff to count as frozen')
    ap.add_argument('--min-frozen', type=int, default=5, help='frozen frames that fail a wipe')
    ap.add_argument('--allowed-route-plays', type=int, default=2, help='baseline PLAY 2-110/111 route:// commands allowed')
    ap.add_argument('--json', help='write results here')
    args = ap.parse_args()

    vstart = (to_s(datetime.strptime(args.video_start, '%Y-%m-%d %H:%M:%S'))
              if args.video_start else parse_video_start(args.video))
    entries = parse_log(args.log)
    session, sess_start = pick_session(entries, vstart)
    cmds = commands(session)
    results = log_checks(session, cmds, args.allowed_route_plays)
    wipes = wipe_plays(session, cmds)

    fps = probe_fps(args.video)
    with tempfile.TemporaryDirectory() as tmp:
        P, L = extract(args.video, args.prog_crop, args.logo_crop, tmp)
        P = np.array(P)
        L = np.array(L)
    n = len(P)

    if args.offset is not None:
        off, conf = args.offset, 'given'
    else:
        off, matched, total = calibrate(P, fps, vstart, cmds, args.search)
        if off is None or matched < 3:
            print(f'WARNING: clock calibration failed ({matched if off is not None else 0}/{total} cuts matched). '
                  'Re-run with --offset. Video checks below may be misaligned.', file=sys.stderr)
            off = off or 0.0
        conf = f'{matched}/{total} cut commands matched a picture spike'

    def vframe(t):
        return int(round((t - vstart + off) * fps))

    # black frames
    runs, _ = black_runs(P, args.black_mean, args.black_max)
    ev = []
    for a, b in runs:
        t_log = a / fps + vstart - off
        near = [(abs(t - t_log), t, c) for t, c in cmds if abs(t - t_log) <= 0.06]
        near.sort(key=lambda x: (' 2-11' not in x[2] and 'route' not in x[2], x[0]))
        ev.append(f'video {a / fps:7.2f}s  {b - a + 1} frame(s)  log {clock(t_log)}  <- '
                  + (' | '.join(f'{c[:60]} ({(t - t_log) * 1000:+.0f}ms)' for _, t, c in near[:2]) or 'no command within 60 ms'))
    results.append({'status': 'FAIL' if runs else 'PASS', 'name': 'black frames in program window',
                    'detail': f'{len(runs)} black run(s), {sum(b - a + 1 for a, b in runs)} frame(s) (mean <= {args.black_mean}, max <= {args.black_max})',
                    'evidence': ev[:12]})

    # frozen wipe card
    frozen_ev = []
    bad = 0
    per_wipe = []
    for w in wipes:
        f0 = vframe(w['t'])
        if not (5 < f0 < n - 80):
            continue
        run, start = frozen_run(L, f0, args.bright, args.still)
        w['frozen_frames'] = run
        per_wipe.append(w)
        flag = run >= args.min_frozen
        bad += flag
        frozen_ev.append(f'{clock(w["t"])} PLAY 2-{w["layer"]} {w["form"]:9s}'
                         + (f' first-frame +{w["first_frame_ms"]} ms' if w['first_frame_ms'] is not None else ' (hot promote)   ')
                         + f'  frozen card: {run} frame(s)' + ('  <-- FAIL' if flag else ''))
    results.append({'status': 'FAIL' if bad else ('PASS' if per_wipe else 'WARN'), 'name': 'frozen wipe card at wipe start',
                    'detail': (f'{bad} of {len(per_wipe)} wipes show a frozen card for >= {args.min_frozen} frames'
                               if per_wipe else 'no wipe PLAY inside the recording'),
                    'evidence': frozen_ev})

    # print
    print(f'recording: {args.video}  ({n} frames @ {fps:g} fps, start {clock(vstart)})')
    print(f'log:       {args.log}  (session started {clock(sess_start) if sess_start else "?"}, {len(cmds)} commands)')
    print(f'clock:     video_time = log_time - start + ({off:+.2f} s)   [{conf}]\n')
    order = {'FAIL': 0, 'WARN': 1, 'INFO': 2, 'PASS': 3}
    for r in sorted(results, key=lambda r: order[r['status']]):
        print(f'[{r["status"]:4s}] {r["name"]}: {r["detail"]}')
        for e in r['evidence']:
            print(f'         {e}')
    print()
    print('wipe starts (form / first-frame delay for full-path PLAYs):')
    for w in wipes:
        print(f'  {clock(w["t"])}  2-{w["layer"]}  {w["form"]:9s}  ' + (f'+{w["first_frame_ms"]} ms' if w['first_frame_ms'] is not None else '-'))
    failed = any(r['status'] == 'FAIL' for r in results)
    print('\nRESULT:', 'FAIL' if failed else 'PASS')
    if args.json:
        with open(args.json, 'w') as fh:
            json.dump({'offset': off, 'results': results, 'wipes': wipes}, fh, indent=2)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
