// Codepoints from Nerd Fonts 3 (the nf-oct, nf-md, nf-dev, and nf-seti sets). nf-md sits above U+FFFF, which is why
// these go through fromCodePoint rather than \u escapes.
const glyph = (codepoint: number) => String.fromCodePoint(codepoint);

export const GLYPH = {
  // GitHub's own icons for pull requests, branches, and checks.
  prOpen: glyph(0xf407),
  prDraft: glyph(0xf4dd),
  prMerged: glyph(0xf419),
  prClosed: glyph(0xf4dc),
  branch: glyph(0xf418),
  check: glyph(0xf42e),
  x: glyph(0xf467),
  dot: glyph(0xf444),
  skip: glyph(0xf517),
  diffAdded: glyph(0xf457),
  diffRemoved: glyph(0xf458),
  diffModified: glyph(0xf459),
  diffRenamed: glyph(0xf45a),
  issueOpened: glyph(0xf41b),
  issueClosed: glyph(0xf41d),
  github: glyph(0xf408),
  jira: glyph(0xe75c),
  progress: glyph(0xf0996),
  bug: glyph(0xf00e4),
  timerSand: glyph(0xf051f),
  timerSandFull: glyph(0xf078c),
  gaugeEmpty: glyph(0xf0873),
  gaugeLow: glyph(0xf0875),
  gauge: glyph(0xf029a),
  gaugeFull: glyph(0xf0874),
  fire: glyph(0xf0238),
  fireAlert: glyph(0xf15d7),
  rocketLaunch: glyph(0xf14de),
  crown: glyph(0xf01a5),
  feather: glyph(0xf06d3),
  leaf: glyph(0xf032a),
  bookOpen: glyph(0xf05da),
  robot: glyph(0xf06a9),
  file: glyph(0xe612),
} as const;

export { glyph };
