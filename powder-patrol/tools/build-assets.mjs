// Builds the compact web assets in client/assets from the original CC0 packs.
//
// Sources (all CC0 1.0, see client/assets/CREDITS.md):
//   - Quaternius "Stylized Nature MegaKit"        https://quaternius.itch.io/stylized-nature-megakit
//   - Quaternius "Medieval Village MegaKit"       https://quaternius.itch.io/medieval-village-megakit
//   - Quaternius "Zombie Apocalypse Kit" (characters, dog, vehicles)
//   - Quaternius "Ultimate Animated Character Pack" (tourists)
//   - ambientCG Snow010A, Rock051                 https://ambientcg.com
//
// Usage: ASSET_SRC=/path/to/downloads node tools/build-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, mergeDocuments, unpartition, weld } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = process.env.ASSET_SRC || '/tmp/claude-0/assets-dl';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../client/assets');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const NATURE = `${SRC}/nature/x/glTF`;
const VILLAGE = `${SRC}/medieval-village-megakit/x/Medieval Village MegaKit[Standard]/glTF`;
const CV = `${SRC}/cv`;

async function finish(doc, out, size = 1024) {
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  );
  await io.write(out, doc);
  console.log(`${path.basename(out).padEnd(22)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

// Merge many single-model files into one GLB; each model becomes a named root node.
async function kit(dir, names, out, size) {
  const doc = await io.read(path.join(dir, names[0] + (fs.existsSync(path.join(dir, names[0] + '.gltf')) ? '.gltf' : '.glb')));
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const wrap = (sc, name) => {
    const group = doc.createNode(name);
    for (const child of sc.listChildren()) { sc.removeChild(child); group.addChild(child); }
    return group;
  };
  const first = wrap(scene, names[0]);
  scene.addChild(first);
  for (const n of names.slice(1)) {
    const file = path.join(dir, n + (fs.existsSync(path.join(dir, n + '.gltf')) ? '.gltf' : '.glb'));
    const src = await io.read(file);
    const before = new Set(doc.getRoot().listScenes());
    mergeDocuments(doc, src);
    for (const sc of doc.getRoot().listScenes()) {
      if (before.has(sc)) continue;
      scene.addChild(wrap(sc, n));
      sc.dispose();
    }
  }
  await doc.transform(unpartition());
  await finish(doc, out, size);
}

async function single(file, out, { size = 1024, dropNodes = [], dropAnims = false } = {}) {
  const doc = await io.read(file);
  for (const node of doc.getRoot().listNodes()) {
    if (dropNodes.includes(node.getName())) node.dispose();
  }
  // characters sharing a rig only need one copy of the animation clips
  if (dropAnims) {
    for (const a of doc.getRoot().listAnimations()) {
      for (const smp of a.listSamplers()) { smp.getInput()?.dispose(); smp.getOutput()?.dispose(); smp.dispose(); }
      for (const ch of a.listChannels()) ch.dispose();
      a.dispose();
    }
  }
  await finish(doc, out, size);
}

async function texture(src, out, size = 1024, quality = 82) {
  await sharp(src).resize(size, size).webp({ quality }).toFile(out);
  console.log(`${path.basename(out).padEnd(22)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

await kit(NATURE, [
  'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5', 'DeadTree_1', 'DeadTree_2', 'DeadTree_3',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Bush_Common', 'Pebble_Round_1', 'Pebble_Round_3', 'Pebble_Square_2',
], `${OUT}/nature.glb`, 1024);

await kit(VILLAGE, [
  'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Door_Round', 'Wall_UnevenBrick_Window_Wide_Round',
  'Wall_Plaster_Straight', 'Wall_Plaster_WoodGrid', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Window_Thin_Round', 'Wall_Plaster_Door_Round',
  'Corner_Exterior_Wood', 'Corner_Exterior_Brick', 'Floor_WoodDark',
  'Roof_RoundTiles_4x4', 'Roof_RoundTiles_6x6', 'Roof_RoundTiles_6x8', 'Roof_RoundTiles_8x10',
  'Balcony_Simple_Straight', 'Balcony_Cross_Straight', 'Prop_Chimney', 'Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1',
  'Prop_Crate', 'Prop_Wagon', 'Prop_Support', 'Stairs_Exterior_Straight',
], `${OUT}/village.glb`, 1024);

const WEAPONS = ['Axe', 'Guitar', 'Knife', 'Pistol', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'];
for (const n of ['Lis', 'Matt', 'Sam', 'Shaun']) {
  await single(`${CV}/zak_Characters_${n}.glb`, `${OUT}/char_${n.toLowerCase()}.glb`, { size: 1024, dropNodes: WEAPONS, dropAnims: n !== 'Lis' });
}
await single(`${CV}/zak_Characters_GermanShepherd.glb`, `${OUT}/dog.glb`, { size: 512 });
for (const n of ['Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Worker_Male', 'Doctor_Male_Young', 'Chef_Male', 'Cowboy_Male', 'Suit_Male', 'OldClassy_Male']) {
  await single(`${CV}/uac_${n}.glb`, `${OUT}/tourist_${n.toLowerCase()}.glb`, { size: 512, dropAnims: n !== 'Casual_Male' });
}
for (const n of ['Pickup', 'Truck']) {
  await single(`${CV}/zak_Vehicle_${n}.glb`, `${OUT}/vehicle_${n.toLowerCase()}.glb`, { size: 1024 });
}

await texture(`${SRC}/tex/Snow010A/Snow010A_1K-JPG_Color.jpg`, `${OUT}/snow_color.webp`);
await texture(`${SRC}/tex/Snow010A/Snow010A_1K-JPG_NormalGL.jpg`, `${OUT}/snow_normal.webp`, 1024, 90);
await texture(`${SRC}/tex/Rock051/Rock051_1K-JPG_Color.jpg`, `${OUT}/rock_color.webp`);
await texture(`${SRC}/tex/Rock051/Rock051_1K-JPG_NormalGL.jpg`, `${OUT}/rock_normal.webp`, 1024, 90);

let total = 0;
for (const f of fs.readdirSync(OUT)) total += fs.statSync(path.join(OUT, f)).size;
console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB`);
