// Semaphore pastel palette shared by the tray icon and the popover UI.
// Thresholds are on the WORST of five_hour.pct / seven_day.pct.
module.exports = {
  mint:   { hex: '#A8E6C0', rgb: [0xa8, 0xe6, 0xc0] }, // 0-50%
  butter: { hex: '#FFE99A', rgb: [0xff, 0xe9, 0x9a] }, // 50-80%
  coral:  { hex: '#FFB3A7', rgb: [0xff, 0xb3, 0xa7] }, // 80-100%
  neutral: { hex: '#C9C9C9', rgb: [0xc9, 0xc9, 0xc9] }, // unavailable
  outline: { hex: '#5A5A5A', rgb: [0x5a, 0x5a, 0x5a] },
  track:  { hex: '#3A3A3A', rgb: [0x3a, 0x3a, 0x3a] }, // unfilled interior

  colorForPct(pct) {
    if (pct == null) return this.neutral;
    if (pct >= 80) return this.coral;
    if (pct >= 50) return this.butter;
    return this.mint;
  }
};
