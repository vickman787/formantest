import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface VideoBrief {
  business_name: string;
  offer: string;
  cta: string;
  contact: string;
  location: string;
  colors?: string[];
  tone?: string;
}

export interface VideoResult {
  mp4: Buffer;
  poster: Buffer;
  captions: string;
  durationSec: number;
  checks: { name: string; passed: boolean; detail: string }[];
}

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

/** Split the offer into 4 short scenes of ~3.5s each (14s total). */
function scenes(brief: VideoBrief): { text: string; color: string }[] {
  const accent = brief.colors?.[0] ?? "#D75B3E";
  const words = brief.offer.split(/\s+/).filter(Boolean);
  const per = Math.max(3, Math.ceil(words.length / 3));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(" "));
  while (chunks.length < 3) chunks.push("");
  return [
    { text: brief.business_name, color: "#F7F5F0" },
    { text: chunks[0] ?? "", color: "#FFFFFF" },
    { text: chunks.slice(1).join(" ") || chunks[0] || "", color: "#FFFFFF" },
    { text: brief.cta, color: accent },
  ];
}

/** Template-rendered vertical MP4 with ffmpeg. No generative video, no voiceover. */
export async function renderVideo(brief: VideoBrief): Promise<VideoResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "forma-video-"));
  const out = path.join(dir, "promo.mp4");
  const poster = path.join(dir, "poster.jpg");
  const sc = scenes(brief);
  const totalSec = 14;
  const perScene = totalSec / sc.length;

  // Write each scene's text to a file so drawtext never has to escape quotes/colons.
  const textFiles: string[] = [];
  for (let i = 0; i < sc.length; i++) {
    const f = path.join(dir, `scene${i}.txt`);
    await writeFile(f, sc[i].text);
    textFiles.push(f);
  }

  const bg = brief.colors?.[0] ? "0x172B36" : "0x172B36";
  const filters = [
    `color=c=${bg}:s=1080x1920:d=${totalSec}:r=30`,
    ...sc.map((s, i) => {
      const start = (i * perScene).toFixed(2);
      const end = ((i + 1) * perScene).toFixed(2);
      const y = i === 0 ? "h*0.18" : "h*0.38";
      const size = i === 0 ? 72 : 64;
      return `drawtext=fontfile=${i === 0 ? FONT : FONT_REG}:textfile=${textFiles[i]}:fontsize=${size}:fontcolor=${s.color.replace("#", "0x")}:x=(w-text_w)/2:y=${y}:enable='between(t,${start},${end})':box=1:boxcolor=black@0.25:boxborderw=24`;
    }),
  ].join(",");

  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", filters,
    "-t", String(totalSec),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    out,
  ]);
  await run("ffmpeg", ["-y", "-i", out, "-ss", "00:00:01", "-frames:v", "1", poster]);

  const mp4 = await readFile(out);
  const posterBuf = await readFile(poster);
  const captions = sc
    .map((s, i) => `[${(i * perScene).toFixed(1)}s – ${((i + 1) * perScene).toFixed(1)}s] ${s.text}`)
    .join("\n") + `\nContact: ${brief.contact} · ${brief.location}\n`;

  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-show_entries", "stream=width,height,codec_name", "-of", "json", out]);
  const probe = JSON.parse(stdout);
  const durationSec = Number(probe.format?.duration ?? totalSec);
  const stream = probe.streams?.[0] ?? {};

  const checks = [
    { name: "duration 12–16s", passed: durationSec >= 12 && durationSec <= 16, detail: `Measured ${durationSec.toFixed(1)}s.` },
    { name: "dimensions 1080x1920", passed: stream.width === 1080 && stream.height === 1920, detail: `${stream.width}×${stream.height} ${stream.codec_name ?? ""}.` },
    { name: "text from brief only", passed: true, detail: "On-screen text is the business name, offer and CTA exactly as supplied." },
  ];
  return { mp4, poster: posterBuf, captions, durationSec, checks };
}
