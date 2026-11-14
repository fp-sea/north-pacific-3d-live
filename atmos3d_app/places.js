// Place names for orientation: cities and islands (a dot and a name) and
// seas/regions (a name only, italic). Coordinates are the places' own, lon in
// 0..360 east so they sit on the dateline-crossing grid. Everything here must
// lie inside the data domain (checked in tests/js/places.test.mjs).
//
// rank: 1 is shown first and wins when labels would overlap.
// No imports, so node --test can load it.

export const PLACES = [
  // North Pacific rim
  { name: "Tokyo", lat: 35.68, lon: 139.69, kind: "city", rank: 1 },
  { name: "Sapporo", lat: 43.06, lon: 141.35, kind: "city", rank: 3 },
  { name: "Petropavlovsk", lat: 53.02, lon: 158.65, kind: "city", rank: 2 },
  { name: "Adak (Aleutians)", lat: 51.88, lon: 183.36, kind: "city", rank: 2 },
  { name: "Anchorage", lat: 61.22, lon: 210.1, kind: "city", rank: 1 },
  { name: "Kodiak", lat: 57.79, lon: 207.6, kind: "city", rank: 3 },
  { name: "Juneau", lat: 58.3, lon: 225.58, kind: "city", rank: 3 },
  { name: "Vancouver", lat: 49.28, lon: 236.88, kind: "city", rank: 2 },
  { name: "Seattle", lat: 47.61, lon: 237.67, kind: "city", rank: 1 },
  { name: "San Francisco", lat: 37.77, lon: 237.58, kind: "city", rank: 1 },
  { name: "Los Angeles", lat: 34.05, lon: 241.76, kind: "city", rank: 2 },
  // Central and tropical Pacific
  { name: "Honolulu", lat: 21.31, lon: 202.14, kind: "city", rank: 1 },
  { name: "Midway", lat: 28.21, lon: 182.63, kind: "city", rank: 2 },
  { name: "Wake Island", lat: 19.28, lon: 166.65, kind: "city", rank: 3 },
  { name: "Guam", lat: 13.44, lon: 144.79, kind: "city", rank: 1 },
  { name: "Majuro", lat: 7.09, lon: 171.38, kind: "city", rank: 3 },
  { name: "Tarawa", lat: 1.35, lon: 172.98, kind: "city", rank: 3 },
  { name: "Kiritimati", lat: 1.87, lon: 202.6, kind: "city", rank: 3 },
  // South of the equator
  { name: "Port Moresby", lat: -9.44, lon: 147.18, kind: "city", rank: 2 },
  { name: "Honiara", lat: -9.43, lon: 159.95, kind: "city", rank: 3 },
  { name: "Suva (Fiji)", lat: -18.14, lon: 178.44, kind: "city", rank: 2 },
  { name: "Apia (Samoa)", lat: -13.83, lon: 188.23, kind: "city", rank: 2 },
  { name: "Tahiti", lat: -17.53, lon: 210.43, kind: "city", rank: 1 },
  // Seas and regions (names only)
  { name: "Sea of Okhotsk", lat: 55.0, lon: 150.0, kind: "sea", rank: 2 },
  { name: "Bering Sea", lat: 58.0, lon: 180.0, kind: "sea", rank: 1 },
  { name: "Gulf of Alaska", lat: 56.0, lon: 215.0, kind: "sea", rank: 1 },
  { name: "North Pacific", lat: 40.0, lon: 180.0, kind: "sea", rank: 2 },
  { name: "Philippine Sea", lat: 20.0, lon: 135.5, kind: "sea", rank: 3 },
  { name: "Coral Sea", lat: -16.0, lon: 152.0, kind: "sea", rank: 3 },
  { name: "South Pacific", lat: -12.0, lon: 225.0, kind: "sea", rank: 2 },
];
