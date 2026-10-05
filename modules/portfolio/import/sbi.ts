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
 * Shift_JIS 二进制解码为字符串
 */
export function decodeShiftJIS(buffer: ArrayBuffer): string {
  return iconv.decode(Buffer.from(buffer), 'shift_jis');
}

/**
 * CSV 按行分割（支持换行符）
 */
export function splitCSVLines(text: string): string[] {
  return text.split(/\r?\n/).filter(line => line.trim());
}

/**
 * CSV 行按字段分割（简易实现，不支持双引号内逗号）
 */
export function splitCSVFields(line: string): string[] {
  return line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
}

/**
 * 去除千分位逗号转为数值字符串
 */
export function parseNumber(value: string): string {
  if (!value) return '0';
  // 去除千分位逗号
  const cleaned = value.replace(/,/g, '');
  // 数值检查
  if (isNaN(Number(cleaned))) {
    throw new Error(`无效数值：${value}`);
  }
  return cleaned;
}

/**
 * 从表头行检测列索引
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
 * SBI 持仓 CSV 解析
 */
export function parseSBIPositions(csvText: string): {
  positions: ParsedPosition[];
  errors: CSVError[];
} {
  const lines = splitCSVLines(csvText);
  if (lines.length < 2) {
    return {
      positions: [],
      errors: [{ row: 1, message: 'CSV 为空或只有表头' }],
    };
  }

  const headerLine = lines[0];
  const headers = splitCSVFields(headerLine);
  const indexes = detectColumnIndexes(headers, SBI_HEADERS);

  // 必需列检查
  const required = ['SYMBOL', 'NAME', 'QUANTITY', 'PRICE'];
  const missing = required.filter(k => indexes[k] === undefined);
  if (missing.length > 0) {
    return {
      positions: [],
      errors: [{
        row: 1,
        message: `缺少必需列：${missing.join(', ')}`,
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
        errors.push({ row, message: '证券代码或名称为空' });
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
        message: error instanceof Error ? error.message : '行解析失败',
      });
    }
  }

  return { positions, errors };
}

/**
 * SBI 入出金 CSV 解析
 */
export function parseSBICashFlows(csvText: string): {
  cashFlows: ParsedCashFlow[];
  errors: CSVError[];
} {
  const lines = splitCSVLines(csvText);
  if (lines.length < 2) {
    return {
      cashFlows: [],
      errors: [{ row: 1, message: 'CSV 为空或只有表头' }],
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
        message: `缺少必需列：${missing.join(', ')}`,
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

      // 日期格式转换（例：2024/01/01 → 2024-01-01）
      const date = dateStr.replace(/\//g, '-');
      
      // 方向判定
      let direction: 'deposit' | 'withdrawal';
      if (directionStr.includes('入金') || directionStr.includes('振込')) {
        direction = 'deposit';
      } else if (directionStr.includes('出金') || directionStr.includes('引出')) {
        direction = 'withdrawal';
      } else {
        errors.push({ row, message: `未知入出金类型：${directionStr}` });
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
        message: error instanceof Error ? error.message : '行解析失败',
      });
    }
  }

  return { cashFlows, errors };
}
