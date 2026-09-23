"""Original 128 BPM / 16-bar American-football stadium instrumental.

Synthesized brass fanfare, marching drumline, stadium stomp/clap and bass.
Requires NumPy. No external recordings or song samples.

Render WAV, then encode the runtime track with macOS afconvert:
afconvert -f m4af -d aac -b 128000 outputs/source-assets/stadium-rush.wav public/assets/stadium-rush.m4a
"""
from pathlib import Path
import wave
import numpy as np

RATE = 44100
BEAT = 60 / 128
LENGTH = 64 * BEAT
mix = np.zeros((round(LENGTH * RATE), 2), dtype=np.float64)
rng = np.random.default_rng(128)


def add(signal, beat, gain=1, pan=0, echo=False):
    start = round(beat * BEAT * RATE)
    stereo = np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)])
    indices = (start + np.arange(len(signal))) % len(mix)
    mix[indices] += signal[:, None] * stereo * gain
    if echo:
        # Short diffuse stadium reflections, rather than a rhythmic synth delay.
        for delay, level in ((.13, .14), (.23, .09), (.39, .05)):
            add(signal, beat + delay, gain * level, -pan)


def note(midi, beats, voice='brass'):
    t = np.arange(round(beats * BEAT * RATE)) / RATE
    f = 440 * 2 ** ((midi - 69) / 12)
    phase = 2 * np.pi * f * t
    if voice == 'bass':
        tone = np.sin(phase) + .4 * np.sin(2 * phase) + .16 * np.sin(3 * phase)
        env = (1 - np.exp(-t * 160)) * np.exp(-t * 4)
    elif voice == 'chord':
        # Quiet organ-like backing underneath the horn section.
        tone = np.sin(phase) + .35 * np.sin(phase * 2) + .18 * np.sin(phase * 3)
        env = (1 - np.exp(-t * 45)) * np.exp(-t * 2.5)
    else:
        # Detuned horn section: small pitch scoop, late vibrato and breathy attack.
        vibrato = .012 * np.sin(2 * np.pi * 5.1 * t) * (1 - np.exp(-t * 3))
        scoop = -.22 * (1 - np.exp(-t * 55))
        tone = np.zeros_like(t)
        brightness = .7 + .3 * np.exp(-t * 12)
        for detune, weight in ((.998, .25), (1, .5), (1.002, .25)):
            for harmonic in range(1, 10):
                color = np.exp(-((harmonic * f) / 2400) ** 2) / harmonic ** .75
                tone += weight * color * brightness ** (harmonic - 1) * np.sin(harmonic * (phase * detune + vibrato + scoop))
        env = (1 - np.exp(-t * 65)) * (.72 + .28 * np.exp(-t * 9))
    # Every voice releases smoothly before its buffer ends.
    env *= np.minimum(1, (t[-1] - t) / .045)
    return tone * env


def kick():
    t = np.arange(round(.25 * RATE)) / RATE
    phase = 2 * np.pi * (49 * t + 86 * .025 * (1 - np.exp(-t / .025)))
    return np.sin(phase) * np.exp(-t * 19) * (1 - np.exp(-t * 1500))


def snare():
    t = np.arange(round(.22 * RATE)) / RATE
    noise = rng.uniform(-1, 1, len(t))
    noise = noise - np.roll(noise, 1) * .5
    body = .3 * np.sin(2 * np.pi * 235 * t) + .15 * np.sin(2 * np.pi * 358 * t)
    return (.55 * noise + body) * np.exp(-t * 22) * (1 - np.exp(-t * 1800))


def clap():
    t = np.arange(round(.25 * RATE)) / RATE
    noise = rng.uniform(-1, 1, len(t))
    noise = (noise + np.roll(noise, 1)) / 2 - .5 * np.roll(noise, 5)
    env = np.zeros_like(t)
    for delay in (0, .013, .029, .047):
        dt = np.maximum(t - delay, 0)
        env += (t >= delay) * np.exp(-dt * 30) * (1 - np.exp(-dt * 1300))
    return noise * env * .45


def tom(frequency):
    t = np.arange(round(.32 * RATE)) / RATE
    phase = 2 * np.pi * (frequency * t + frequency * .012 * (1 - np.exp(-t * 30)))
    return (np.sin(phase) + .18 * np.sin(phase * 1.55)) * np.exp(-t * 14) * (1 - np.exp(-t * 900))


def hat(opened=False):
    t = np.arange(round((.13 if opened else .055) * RATE)) / RATE
    noise = rng.uniform(-1, 1, len(t))
    high = noise - np.roll(noise, 1)
    return high * np.exp(-t * (36 if opened else 80)) * (1 - np.exp(-t * 1600))


# Bb / Eb / Gm / F: short call-and-response brass fanfare with breathing room.
chords = [(34, [58, 62, 65]), (39, [58, 63, 67]),
          (43, [58, 62, 67]), (41, [57, 60, 65])]
phrases = [[70, 77, 74, 72], [75, 79, 77, 75],
           [74, 79, 77, 74], [72, 77, 75, 69]]
for bar in range(16):
    at = bar * 4
    root, chord = chords[(bar // 2) % 4]
    # Stomp and clap backbeat; syncopated bass avoids the former dance pulse.
    for offset in (0, 1.5, 2, 2.75):
        add(kick(), at + offset, .7 if offset in (0, 2) else .42)
        add(note(root, .65, 'bass'), at + offset, .2)
    for offset in (1, 3):
        add(snare(), at + offset, .32, -.12, True)
        add(clap(), at + offset, .23, .42, True)
        add(clap(), at + offset + .035, .19, -.45, True)
    for offset in (.5, 1.5, 2.5, 3.5):
        add(hat(), at + offset, .04, .25)
    if bar % 2:
        for offset in (2.5, 2.75, 3.5, 3.75):
            add(snare(), at + offset, .065, -.25)
    for offset in (0, 2):
        for i, pitch in enumerate(chord):
            add(note(pitch, 1.35, 'chord'), at + offset, .035, (i - 1) * .4, True)
    melody = phrases[(bar // 2) % 4]
    offsets = (0, .75, 1.5, 2.5)
    durations = (.55, .5, .6, 1)
    if bar % 2:
        melody = [melody[2], melody[0], melody[1]]
        offsets = (.5, 1.25, 2)
        durations = (.5, .5, 1.25)
    # Four-bar drum break with lower horns, then the full brass section returns.
    if 8 <= bar < 12:
        melody = [pitch - 12 for pitch in melody[:2]]
        offsets, durations = (0, 2), (.6, .8)
    for offset, pitch, duration in zip(offsets, melody, durations):
        add(note(pitch, duration), at + offset, .09, -.18, True)
        add(note(pitch - 12, duration), at + offset + .014, .055, .23, True)
    if bar % 4 == 3:
        for i, offset in enumerate((3.25, 3.5, 3.75)):
            add(tom((165, 125, 92)[i]), at + offset, .25, -.4 + i * .4, True)

mix = np.tanh(mix * 1.1)
mix *= .88 / np.max(np.abs(mix))
out = Path('outputs/source-assets/stadium-rush.wav')
out.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(out), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'{out}: {LENGTH:.2f}s, peak {np.max(np.abs(mix)):.3f}, RMS {np.sqrt(np.mean(mix**2)):.3f}')
