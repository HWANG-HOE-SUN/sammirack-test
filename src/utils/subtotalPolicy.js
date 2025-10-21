/**
 * Subtotal 정책 계산 유틸
 * 정책 종류:
 *  - BOM_ONLY_WITH_ITEM_FALLBACK:
 *      1) BOM(원자재) 항목 개수 > 0 AND BOM 합계(matSum) > 0 이면 matSum
 *      2) 그 외 (BOM 없음 또는 BOM 합계 0) 이고 itemSum > 0 이면 itemSum
 *      3) 둘 다 0이면 0
 *  - BOM_ONLY_STRICT: BOM 합계만 (0 허용)
 *  - ITEM_ONLY: 품목(Item) 합계만
 *  - SUM_BOTH: itemSum + matSum (과거 중복 문제 원인)
 */
export function extractSubtotal({
  itemSum = 0,
  matSum = 0,
  materialCount = 0,
  policy = 'BOM_ONLY_WITH_ITEM_FALLBACK'
}) {
  switch (policy) {
    case 'BOM_ONLY_WITH_ITEM_FALLBACK': {
      const hasMeaningfulBOM = materialCount > 0 && matSum > 0;
      if (hasMeaningfulBOM) return matSum;
      if (itemSum > 0) return itemSum;
      // 둘 다 0
      return matSum || itemSum || 0;
    }
    case 'BOM_ONLY_STRICT':
      return matSum;
    case 'ITEM_ONLY':
      return itemSum;
    case 'SUM_BOTH':
      return itemSum + matSum;
    default: {
      const hasMeaningfulBOM = materialCount > 0 && matSum > 0;
      if (hasMeaningfulBOM) return matSum;
      if (itemSum > 0) return itemSum;
      return matSum || itemSum || 0;
    }
  }
}
