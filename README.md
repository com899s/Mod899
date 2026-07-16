# 🎬 LyricAMV Studio

**Free online AI music lyrics video & AMV (anime music video) maker.**
Runs 100% in your browser — no server, no sign-up, no watermark, and your files never leave your device.

## ✨ Features

- **🎵 Music analysis (AI)** — drop in any MP3/WAV/OGG and the app detects beats, estimates BPM and measures song energy, all client-side with the Web Audio API.
- **📝 Lyrics sync**
  - **AI Auto-Sync** — distributes your lyric lines across the vocally-active part of the song (energy-weighted, beat-snapped).
  - **Tap Sync** — play the song and tap <kbd>Space</kbd> as each line starts.
  - **LRC import/export** — load existing `.lrc` files or save your sync work.
- **🖼️ AMV visuals** — drop in anime artwork/screenshots; the app applies automatic Ken-Burns motion, beat-timed crossfade cuts and a readable cinematic tint.
- **🤖 AI Style Suggest** — picks a theme, font and text animation that match the song's tempo and energy (fast & loud → Battle AMV, slow & quiet → Lo-fi Rain, etc.).
- **🎨 8 animated themes** — Sakura Dream, Neon Tokyo, Midnight Sky, AMV Sunset, Lo-fi Rain, Winter Ballad, Battle AMV, Vaporwave — each with its own particle system (petals, sparks, stars, embers, rain, snow, bubbles).
- **🔤 5 text animations** — Fade, Rise & Glow, Karaoke Fill, Typewriter, Beat Bounce.
- **🎚️ Effects** — beat pulse/zoom, live audio spectrum bars, cinematic vignette, film grain, AMV letterbox bars.
- **📐 Output formats** — 720p, 1080p, vertical 9:16 (Shorts/TikTok) and square 1:1.
- **⬇️ Video export** — renders your video with synced audio to a downloadable **WebM** file using `MediaRecorder`, right in the browser.

## 🚀 Use it

Open `index.html` in any modern browser (Chrome/Edge recommended for export), or serve the folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

The included GitHub Actions workflow deploys the app to **GitHub Pages** automatically — enable Pages (Settings → Pages → Source: GitHub Actions) and every push to the default branch publishes it.

## 🕹️ How to make a video

1. **Music** — drop an audio file. BPM/beats/energy are analysed instantly.
2. **Lyrics** — paste lyrics (one line per row), then hit **✨ AI Auto-Sync** or **👆 Tap Sync**. Fine-tune with <kbd>Shift</kbd>+click on a timestamp to set it to the current playback time.
3. **Visuals** — drop anime images for the AMV background (optional — themes render animated backgrounds on their own).
4. **Style** — hit **🤖 AI Suggest Style** or pick a theme/font/animation yourself.
5. **Export** — press **⬇ Export Video** and the video renders in real time to a `.webm` file.

> Tip: WebM plays everywhere modern and uploads fine to YouTube. Need MP4? Any free converter (e.g. `ffmpeg -i video.webm video.mp4`) will do.

## 🔒 Privacy

Everything — decoding, analysis, rendering, encoding — happens locally in your browser tab. Nothing is uploaded anywhere.

## ⚖️ Note

Only use music and artwork you have the rights to use.
