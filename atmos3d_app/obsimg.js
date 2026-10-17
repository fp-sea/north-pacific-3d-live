// What radar and satellite observed at the 3 km model's hours in a Northwest case step (user request 2026-10-14), so a
// step can set the model beside the observations. The images are obsimg/<kind>_<YYYYMMDDHH>.(png|jpg) with
// obsimg/index.json (made once by tools/fetch_case_obsimg.py): Mercator images over the same box as the 3 km model,
// draped on the map. This module says what each image shows and finds a frame's image. Pure, no imports.

// kind -> {label (the menu), legend, why, look, pair (the model's view to compare with)}
export const OBS_IMAGES = {
  radar: { label: "radar (observed, MRMS)", pair: "refc",
    why: "The radar mosaic: what the network of radars actually saw, a scan within a few minutes of the hour, in the same colours as the model's radar. Faint grey: no radar reaches there (far offshore, behind mountains).",
    look: "where the rain is falling now; then flip (⇄) to the model at the same hour and compare where it put the rain or cloud." },
  ir: { label: "satellite: infrared (observed, GOES-West)", pair: "tcc",
    why: "Infrared from GOES-West, day and night: the temperature of whatever the satellite sees. Cloud tops colder than −30 °C are coloured, colder and higher in this order: blue, green (−50), yellow (−60), red (−70), purple (−80), white (the tallest thunderstorm tops); warm ground, sea and low cloud are grey to black.",
    look: "a storm's comma-shaped cloud and its dry slot; tall thunderstorm tops; low stratus that's hard to tell from the ground at night." },
  true: { label: "satellite: true colour (observed, daytime)", pair: "tcc",
    why: "GOES-West's visible bands combined into an image close to what your eye would see from space, by daylight only.",
    look: "marine stratus and fog (smooth, bright), smoke (brown haze), snow on the ground, and showery cumulus (cells and streets)." },
  wv: { label: "satellite: water vapour (observed, GOES-West)", pair: "pwat",
    why: "GOES-West's upper-level water vapour band (6.2 µm): moist air high up shows blue and white, dry air sinking from above tan and brown.",
    look: "the river of moist air aloft and the dry air behind the front." },
};

// The image of a kind for a frame key (YYYYMMDDHH), or null: {file, time, sat}.
export function obsImage(index, key, kind) {
  return index?.frames?.[key]?.[kind] ?? null;
}

// The kinds any of these frame keys has, in the order of OBS_IMAGES.
export function obsKinds(index, keys) {
  return Object.keys(OBS_IMAGES).filter((k) => keys.some((key) => obsImage(index, key, k)));
}
