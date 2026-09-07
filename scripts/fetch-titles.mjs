#!/usr/bin/env node
// Adds videos to videos.json, fetching titles automatically from YouTube's
// public oEmbed endpoint (no API key needed).
//
// Usage:
//   node scripts/fetch-titles.mjs <category> <subcategory> <videoIdOrUrl> [<videoIdOrUrl> ...]
//
// Example:
//   node scripts/fetch-titles.mjs music אבא dQw4w9WgXcQ https://youtu.be/wOV6YBnjRNE
//
// Existing (category, subcategory, id) triples are skipped so re-running is safe.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_JSON = path.join(__dirname, '..', 'videos.json');

function extractYoutubeId(input) {
  if (/^[\w-]{11}$/.test(input)) return input; // already a bare video id
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
    const watchId = url.searchParams.get('v');
    if (watchId) return watchId;
    const liveMatch = url.pathname.match(/^\/live\/([^/?]+)/);
    if (liveMatch) return liveMatch[1];
  } catch {
    // not a URL, and didn't match the bare-id pattern above
  }
  return null;
}

async function fetchTitle(videoId) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) {
    throw new Error(`oEmbed lookup failed for ${videoId}: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.title;
}

async function main() {
  const [category, subcategory, ...rawInputs] = process.argv.slice(2);

  if (!category || !subcategory || rawInputs.length === 0) {
    console.error('Usage: node scripts/fetch-titles.mjs <category> <subcategory> <videoIdOrUrl> [...]');
    process.exit(1);
  }

  const videos = JSON.parse(await readFile(VIDEOS_JSON, 'utf8'));
  videos[category] ??= {};
  videos[category][subcategory] ??= [];
  const list = videos[category][subcategory];
  const existingIds = new Set(list.map(v => v.id));

  for (const rawInput of rawInputs) {
    const id = extractYoutubeId(rawInput);
    if (!id) {
      console.warn(`Skipping "${rawInput}": could not extract a video id`);
      continue;
    }
    if (existingIds.has(id)) {
      console.log(`Skipping ${id}: already in ${category}/${subcategory}`);
      continue;
    }
    try {
      const title = await fetchTitle(id);
      list.push({ id, title });
      existingIds.add(id);
      console.log(`Added ${id}: ${title}`);
    } catch (err) {
      console.error(err.message);
    }
  }

  await writeFile(VIDEOS_JSON, JSON.stringify(videos, null, 2) + '\n');
  console.log(`Saved ${VIDEOS_JSON}`);
}

main();
