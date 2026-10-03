// Observed infrared frames (GOES-18 + Himawari-9, ~20 min apart) covering
// the 24 h up to the build time, from the
// manifest's `satellite` entry (copy_satellite_frames.py). Frames are
// greyscale JPEGs on the ground texture's own Mercator pixel grid, so they
// drape on the ground mesh directly (flat map or globe).
//
// Textures load in the background, nearest the time on screen first. The
// frame on screen is exactly the newest one at or before the time shown --
// never an older one standing in while it loads (that once showed a frame
// from 20 h earlier at "now"), and never a blend. valueAt() reads a pixel back as brightness temperature for the
// hover readout.
import * as THREE from "three";

export class SatelliteFrames {
  // version: "?v=<build id>" -- frame file names repeat every build.
  constructor(dataBase, entry, anchorIso, version = "") {
    this.version = version;
    const t0 = Date.parse(anchorIso);
    this.base = dataBase;
    this.entry = entry;
    this.frames = entry.frames.map((f) => ({ ...f, hours: (Date.parse(f.time) - t0) / 3600e3, tex: null, img: null }));
    this.loaded = 0;
    this.pixels = new Map();     // frame index -> ImageData (last few only)
  }

  get hours() { return this.frames.map((f) => f.hours); }

  // Load every frame's texture, nearest to `hoursFirst` first, `onLoad(i)` after each.
  loadAll(onLoad, hoursFirst = Infinity) {
    const loader = new THREE.TextureLoader();
    const order = this.frames.map((f, i) => i)
      .sort((a, b) => Math.abs(this.frames[a].hours - hoursFirst) - Math.abs(this.frames[b].hours - hoursFirst));
    let next = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++];
      loader.load(`${this.base}/${this.frames[i].file}${this.version}`, (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        this.frames[i].tex = tex;
        this.frames[i].img = tex.image;
        this.loaded++;
        onLoad(i);
        pump();
      }, undefined, () => { this.loaded++; pump(); });
    };
    for (let k = 0; k < 4; k++) pump();
  }

  // Index of the newest frame at or before `hours` (the first frame if
  // earlier than all of them).
  indexAt(hours) {
    let best = 0;
    for (let i = 0; i < this.frames.length; i++) if (this.frames[i].hours <= hours + 1e-6) best = i;
    return best;
  }

  // The newest frame at or before `hours`, if its texture has loaded (null
  // otherwise, and before the first frame).
  textureAt(hours) {
    if (!this.frames.length || hours < this.frames[0].hours - 1e-6) return null;
    const i = this.indexAt(hours), f = this.frames[i];
    return f.tex ? { tex: f.tex, frame: f, i } : null;
  }

  // Brightness temperature (K) at texture coordinates (u, v in 0..1, v up)
  // in frame i; null where the frame has no data (black) or isn't loaded.
  valueAt(i, u, v) {
    const f = this.frames[i];
    if (!f?.img) return null;
    let data = this.pixels.get(i);
    if (!data) {
      const c = document.createElement("canvas");
      c.width = f.img.width; c.height = f.img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(f.img, 0, 0);
      data = g.getImageData(0, 0, c.width, c.height);
      this.pixels.set(i, data);
      if (this.pixels.size > 3) this.pixels.delete(this.pixels.keys().next().value);
    }
    const x = Math.min(data.width - 1, Math.max(0, Math.round(u * (data.width - 1))));
    const y = Math.min(data.height - 1, Math.max(0, Math.round((1 - v) * (data.height - 1))));
    const g = data.data[(y * data.width + x) * 4];
    if (g === 0) return null;
    return this.entry.vmax_k - (g / 255) * (this.entry.vmax_k - this.entry.vmin_k);
  }
}
