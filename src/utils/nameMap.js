const nameMap = {
  // 스탠랙 부품
  'upright_frame_st': '스탠랙 기둥',
  'shelf_st': '스탠랙 선반',
  'bracket_st': '스탠랙 브라켓',
  'bolt_set_st': '고정볼트 세트',
  
  // 하이랙 부품
  'upright_frame_hr': '하이랙 기둥',
  'beam_hr': '하이랙 빔',
  'deck_panel_hr': '하이랙 데크판넬',
  'bracing_hr': '하이랙 브레이싱',
  
  // 기존 하이랙 부품 (호환성)
  'upright_frame_hr_200': '하이랙 기둥 (200kg)',
  'shelf_hr_200': '하이랙 선반 (200kg)',
  'cross_beam_hr': '하이랙 가로대',
  'safety_pin_hr': '안전핀',
  'upright_frame_hr_350': '하이랙 강화기둥 (350kg)',
  'shelf_hr_350': '하이랙 강화선반 (350kg)',
  'upright_frame_hr_700': '파렛트랙 기둥 (700kg)',
  'load_beam_hr_700': '로드빔 (700kg)',
};

export const getKoreanName = (item) => {
  // If item has no code (Excel-based BOM), return the name directly
  if (!item.code && item.name) {
    return item.name;
  }
  
  const baseName = nameMap[item.code] || item.code || item.name || '알 수 없는 부품';
  const { height, size, color } = item.options || {};

  let finalName = baseName;
  if (height) finalName += ` ${height}`;
  if (size) finalName += ` ${size}`;
  if (color) finalName += ` ${color}`;

  return finalName;
};
