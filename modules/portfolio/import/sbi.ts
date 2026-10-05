import * as iconv from 'iconv-lite';

// SBI 证券 CSV 表头映射（Shift_JIS 编码）
export const SBI_HEADERS = {
  // 持仓表
  SYMBOL: ['銘柄コード', '銘柄'],
  NAME: ['銘柄名', '銘柄名称'],
  QUANTITY: ['保有数量', '数量', '株数'],
  AVG_COST: ['平均取得単価', '取得単価', '平均取得価格'],
  PRICE: ['現在値', '評価単価', '時価'],
  ACCOUNT_TYPE: ['口座区分', '口座'],
  CURRENCY: ['通貨', '決済通貨'],
  
  // 入出金
  DATE: ['年月日', '日付', '約定日'],
  DIRECTION: ['入出金区分', '区分'],
  AMOUNT: ['金額', '受渡金額'],
  NOTE: ['摘要', '備考'],
};

export type CSVError = {
  row: number;
  column?: string;
  message: string;
};

export type ParsedPosition = {
  symbol: string;
  name: string;
  quantity: string;
  avgCost: string;
  price: string;
  accountType?: string;
  currency: string;
};

export type ParsedCashFlow = {
  date: string;
  direction: 'deposit' | 'withdrawal';
  amountJpy: string;
  note?: string;
};

/**
 * Shift_JIS バイナリから文字列にデコード
 */
export function decodeShiftJIS(buffer: ArrayBuffer): string {
  return iconv.decode(Buffer.from(buffer), 'shift_jis');
}

/**
 * CSV を行に分割（改行コード対応）
 */
export function splitCSVLines(text: string): string[] {
  return text.split(/\r?\n/).filter(line => line.trim());
}

/**
 * CSV 行をフィールドに分割（簡易実装、ダブルクォート内のカンマは未対応）
 */
export function splitCSVFields(line: string): string[] {
  return line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
}

/**
 * 千分位カンマを除去して数値文字列に変換
 */
export function parseNumber(value: string): string {
  if (!value) return '0';
  // 千分位カンマを除去
  const cleaned = value.replace(/,/g, '');
  // 数値チェック
  if (isNaN(Number(cleaned))) {
    throw new Error(`無効な数値: ${value}`);
  }
  return cleaned;
}

/**
 * 表頭行から列インデックスを検出
 */
export function detectColumnIndexes(
  headers: string[],
  mapping: Record<string, string[]>
): Record<string, number> {
  const indexes: Record<string, number> = {};
  
  for (const [key, possibleNames] of Object.entries(mapping)) {
    for (const name of possibleNames) {
      const index = headers.findIndex(h => h === name);
      if (index >= 0) {
        indexes[key] = index;
        break;
      }
    }
  }
  
  return indexes;
}

/**
 * SBI 持仓 CSV をパース
 */
export function parseSBIPositions(csvText: string): {
  positions: ParsedPosition[];
  errors: CSVError[];
} {
  const lines = splitCSVLines(csvText);
  if (lines.length < 2) {
    return {
      positions: [],
      errors: [{ row: 1, message: 'CSV が空か表頭行のみです' }],
    };
  }

  const headerLine = lines[0];
  const headers = splitCSVFields(headerLine);
  const indexes = detectColumnIndexes(headers, SBI_HEADERS);

  // 必須列チェック
  const required = ['SYMBOL', 'NAME', 'QUANTITY', 'PRICE'];
  const missing = required.filter(k => indexes[k] === undefined);
  if (missing.length > 0) {
    return {
      positions: [],
      errors: [{
        row: 1,
        message: `必須列が見つかりません: ${missing.join(', ')}`,
      }],
    };
  }

  const positions: ParsedPosition[] = [];
  const errors: CSVError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = i + 1; // 物理行号（1-based）
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const fields = splitCSVFields(line);
      
      const symbol = fields[indexes.SYMBOL] || '';
      const name = fields[indexes.NAME] || '';
      const quantity = parseNumber(fields[indexes.QUANTITY] || '0');
      const price = parseNumber(fields[indexes.PRICE] || '0');
      const avgCost = indexes.AVG_COST !== undefined 
        ? parseNumber(fields[indexes.AVG_COST] || '0')
        : price;
      const currency = fields[indexes.CURRENCY] || 'JPY';

      if (!symbol || !name) {
        errors.push({ row, message: '銘柄コードまたは銘柄名が空です' });
        continue;
      }

      positions.push({
        symbol,
        name,
        quantity,
        avgCost,
        price,
        currency,
        accountType: fields[indexes.ACCOUNT_TYPE],
      });
    } catch (error) {
      errors.push({
        row,
        message: error instanceof Error ? error.message : '行の解析に失敗',
      });
    }
  }

  return { positions, errors };
}

/**
 * SBI 入出金 CSV をパース
 */
export function parseSBICashFlows(csvText: string): {
  cashFlows: ParsedCashFlow[];
  errors: CSVError[];
} {
  const lines = splitCSVLines(csvText);
  if (lines.length < 2) {
    return {
      cashFlows: [],
      errors: [{ row: 1, message: 'CSV が空か表頭行のみです' }],
    };
  }

  const headerLine = lines[0];
  const headers = splitCSVFields(headerLine);
  const indexes = detectColumnIndexes(headers, SBI_HEADERS);

  const required = ['DATE', 'DIRECTION', 'AMOUNT'];
  const missing = required.filter(k => indexes[k] === undefined);
  if (missing.length > 0) {
    return {
      cashFlows: [],
      errors: [{
        row: 1,
        message: `必須列が見つかりません: ${missing.join(', ')}`,
      }],
    };
  }

  const cashFlows: ParsedCashFlow[] = [];
  const errors: CSVError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = i + 1;
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const fields = splitCSVFields(line);
      
      const dateStr = fields[indexes.DATE] || '';
      const directionStr = fields[indexes.DIRECTION] || '';
      const amountJpy = parseNumber(fields[indexes.AMOUNT] || '0');

      // 日付フォーマット変換（例：2024/01/01 → 2024-01-01）
      const date = dateStr.replace(/\//g, '-');
      
      // 方向判定
      let direction: 'deposit' | 'withdrawal';
      if (directionStr.includes('入金') || directionStr.includes('振込')) {
        direction = 'deposit';
      } else if (directionStr.includes('出金') || directionStr.includes('引出')) {
        direction = 'withdrawal';
      } else {
        errors.push({ row, message: `不明な入出金区分: ${directionStr}` });
        continue;
      }

      cashFlows.push({
        date,
        direction,
        amountJpy,
        note: fields[indexes.NOTE],
      });
    } catch (error) {
      errors.push({
        row,
        message: error instanceof Error ? error.message : '行の解析に失敗',
      });
    }
  }

  return { cashFlows, errors };
}
