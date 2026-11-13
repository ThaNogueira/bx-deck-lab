// Fit locally from tracked positions. See tools/train-profiles.py.
export const speedProfiles = {
  "grid": [
    0.0,
    0.55,
    1.0
  ],
  "profiles": [
    [
      1.577,
      2.238,
      2.762
    ],
    [
      6.976,
      9.718,
      14.256
    ],
    [
      10.248,
      14.833,
      19.461
    ]
  ],
  "trainingGroups": [
    "C0918",
    "C0919",
    "C0925",
    "C0926",
    "C0929",
    "C0944"
  ],
  "trainingSamples": 1394,
  "testingSamples": 155,
  "bandwidth": 0.12,
  "leaveOneVideoOut": 1.744,
  "testBaseline": 1.925,
  "testError": 1.617
};
