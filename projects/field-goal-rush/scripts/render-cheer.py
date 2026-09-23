from pathlib import Path
import wave
import numpy as np
root=Path(__file__).resolve().parents[1]
with wave.open(str(root/'outputs/source-assets/cheer-yeah.wav')) as w:
    rate=w.getframerate(); channels=w.getnchannels(); a=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float).reshape(-1,channels).mean(axis=1)/32768
active=np.flatnonzero(abs(a)>.009)
a=a[max(0,active[0]-int(.025*rate)):min(len(a),active[-1]+int(.06*rate))]
# Raise vocal pitch/formants for a bright cartoon childlike exclamation.
x=np.interp(np.arange(0,len(a),1.27),np.arange(len(a)),a)
n=min(int(.012*rate),len(x)//2);x[:n]*=np.linspace(0,1,n);x[-n:]*=np.linspace(1,0,n)
stereo=np.zeros((len(x)+int(.18*rate),2))
for channel in range(2):
    stereo[:len(x),channel]+=x
    for delay,gain in [(0.038+channel*.009,.12),(.094+channel*.014,.06)]:
        offset=int(delay*rate);stereo[offset:offset+len(x),channel]+=x*gain
stereo*=.82/max(abs(stereo).max(),.001)
with wave.open(str(root/'public/assets/cheer-yeah.wav'),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((stereo*32767).astype('<i2').tobytes())
print('Cheer:',round(len(stereo)/rate,2),'s')
