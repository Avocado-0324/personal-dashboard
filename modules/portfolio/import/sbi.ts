import Decimal from 'decimal.js';
import { createHash } from 'crypto';

/**
 * SBI「保有証券一覧」CSV 解析（仅日本持仓）
 * 
 * 格式：
 * - 第一行：保有証券一覧
 * - 交替出现：汇总块（合计）→ 详细块（明细），空行分隔
 * - 股票和基金两种类型，每种类型下有多个"預り"（custody）
 * - Shift_JIS 编码
 * 
 * 导入范围：
 * - 只处理日本国内持仓（4个账户：SBI 特定、SBI NISA成長、SBI NISAつみたて、SBI 旧つみたて）
 * - 美国股票账户（SBI 米国株 特定、SBI 米国株 NISA成長）通过截图导入，不在此 CSV 中
 * - 一次导入只覆盖文件中出现的账户，不触及其他账户
 */

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
  accountName: string;
  assetClass: 'jp_stock' | 'fund';
  unitBasis: string;
};

export type ParseResult = {
  positions: ParsedPosition[];
  errors: CSVError[];
  accountSummaries: Array<{
    accountName: string;
    count: number;
    totalValueJpy: string;
    matchesFile: boolean;
  }>;
};

/**
 * Custody → 账户名映射（只有这 4 种）
 */
const CUSTODY_TO_ACCOUNT: Record<string, string> = {
  '特定預り': 'SBI 特定',
  'NISA預り（成長投資枠）': 'SBI NISA成長',
  'NISA預り（つみたて投資枠）': 'SBI NISAつみたて',
  '旧つみたてNISA預り': 'SBI 旧つみたて',
};

/**
 * Shift_JIS 二进制解码（Node.js 环境）
 */
export function decodeShiftJIS(buffer: ArrayBuffer): string {
  // 使用 iconv-lite 或 TextDecoder（如果支持）
  try {
    // Node.js 环境
    const iconv = require('iconv-lite');
    return iconv.decode(Buffer.from(buffer), 'shift_jis');
  } catch {
    // 浏览器环境 fallback（需要 polyfill）
    const decoder = new TextDecoder('shift_jis');
    return decoder.decode(buffer);
  }
}

/**
 * 计算幂等性键（不含 accountName）
 */
export function computeIdempotencyKey(fileBytes: Buffer | ArrayBuffer, asOf: string): string {
  const buffer = Buffer.isBuffer(fileBytes) ? fileBytes : Buffer.from(fileBytes);
  return createHash('sha256')
    .update(buffer)
    .update(asOf)
    .digest('hex');
}

/**
 * CSV 行分割
 */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * CSV 字段分割（简易，支持引号）
 */
function splitFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current);
  return fields.map(f => f.trim());
}

/**
 * 提取嵌套括号内的 custody（从第一个「（」到最后一个「）」）
 */
function extractCustody(sectionName: string): string | null {
  const firstParen = sectionName.indexOf('（');
  const lastParen = sectionName.lastIndexOf('）');
  
  if (firstParen === -1 || lastParen === -1 || firstParen >= lastParen) {
    return null;
  }
  
  return sectionName.substring(firstParen + 1, lastParen);
}

/**
 * 清理数字字符串（去除逗号、+号、口等）
 */
function cleanNumber(value: string): string {
  return value
    .trim()
    .replace(/\+/g, '')
    .replace(/,/g, '')
    .replace(/口$/g, '');
}

/**
 * 完整格式名称 → NFKC 标准化（用于基金的 instrument key）
 */
function normalizeFundName(name: string): string {
  return name.normalize('NFKC');
}

/**
 * 解析 SBI「保有証券一覧」CSV
 */
export function parseSBIHoldings(csvText: string): ParseResult {
  const lines = splitLines(csvText);
  const positions: ParsedPosition[] = [];
  const errors: CSVError[] = [];
  const accountSummaries: Array<{
    accountName: string;
    count: number;
    totalValueJpy: string;
    matchesFile: boolean;
    fileSubtotal?: string;
  }> = [];

  // 第一行应为「保有証券一覧」
  if (lines.length === 0 || !lines[0].includes('保有証券一覧')) {
    errors.push({
      row: 1,
      message: '这不是 SBI 保有証券一覧格式的 CSV。请前往：SBI → 口座管理 > 保有証券 > CSV ダウンロード',
    });
    return { positions, errors, accountSummaries };
  }

  let i = 1;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // 跳过空行
    if (!line) {
      i++;
      continue;
    }
    
    // 检测是否为汇总行（股票或基金）
    const stockSummaryMatch = line.match(/^株式（(.+)）合計/);
    const fundSummaryMatch = line.match(/^投資信託（金額\/(.+)）合計/);
    
    if (stockSummaryMatch || fundSummaryMatch) {
      const assetClass: 'jp_stock' | 'fund' = stockSummaryMatch ? 'jp_stock' : 'fund';
      const custodyRaw = stockSummaryMatch ? stockSummaryMatch[1] : fundSummaryMatch![1];
      const custody = extractCustody(`dummy（${custodyRaw}）`);
      
      if (!custody || !CUSTODY_TO_ACCOUNT[custody]) {
        errors.push({
          row: i + 1,
          message: `未知的预り类型「${custody || custodyRaw}」，无法映射到账户。仅支持：${Object.keys(CUSTODY_TO_ACCOUNT).join('、')}`,
        });
        i++;
        continue;
      }
      
      const accountName = CUSTODY_TO_ACCOUNT[custody];
      
      // 读取汇总数据（跳过空行 + 评价额合计行 + 数据行）
      i++; // 跳过合计标题行
      while (i < lines.length && !lines[i].trim()) i++; // 跳过空行
      
      if (i >= lines.length) break;
      
      // 应该是「評価額合計,評価損益合計」
      const summaryHeaderLine = lines[i].trim();
      i++;
      
      if (i >= lines.length) break;
      
      // 汇总数据行
      const summaryDataLine = lines[i].trim();
      const summaryFields = splitFields(summaryDataLine);
      const fileSubtotal = summaryFields[0] ? cleanNumber(summaryFields[0]) : '0';
      i++;
      
      // 跳过空行，读取详细块标题
      while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) break;
      
      const detailTitleLine = lines[i].trim();
      i++;
      
      // 跳过空行
      while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) break;
      
      // 详细表头
      const headerLine = lines[i].trim();
      const headers = splitFields(headerLine);
      i++;
      
      // 解析详细行
      const sectionPositions: ParsedPosition[] = [];
      let calculatedSubtotal = new Decimal(0);
      
      while (i < lines.length) {
        const dataLine = lines[i].trim();
        
        // 遇到空行或下一节标题，停止
        if (!dataLine) {
          break;
        }
        
        // 检查是否为下一节的标题行（以 株式（ 或 投資信託（ 开头，且以 合計 或 ）结尾）
        if ((dataLine.startsWith('株式（') || dataLine.startsWith('投資信託（')) && 
            (dataLine.endsWith('合計') || dataLine.endsWith('）'))) {
          break;
        }
        
        const fields = splitFields(dataLine);
        
        try {
          if (assetClass === 'jp_stock') {
            // 股票：銘柄コード,銘柄名称,保有株数,売却注文中,取得単価,現在値,取得金額,評価額,評価損益
            const symbol = (fields[0] || '').trim();
            const name = (fields[1] || '').trim();
            const quantityRaw = cleanNumber(fields[2] || '0');
            const avgCostRaw = cleanNumber(fields[4] || '0');
            const priceRaw = cleanNumber(fields[5] || '0');
            const marketValueRaw = cleanNumber(fields[7] || '0');
            
            // 跳过空行或垃圾数据
            if (!symbol || !name || symbol === '\x00' || name.includes('\x00')) {
              i++;
              continue;
            }
            
            const quantity = new Decimal(quantityRaw);
            const avgCost = new Decimal(avgCostRaw);
            const price = new Decimal(priceRaw);
            const marketValue = new Decimal(marketValueRaw);
            
            sectionPositions.push({
              symbol,
              name,
              quantity: quantity.toString(),
              avgCost: avgCost.toString(),
              price: price.toString(),
              accountName,
              assetClass: 'jp_stock',
              unitBasis: '1',
            });
            
            calculatedSubtotal = calculatedSubtotal.plus(marketValue);
          } else {
            // 基金：ファンド名,保有口数,売却注文中,取得単価,基準価額,取得金額,評価額,評価損益,分配金受取方法
            const fundName = (fields[0] || '').trim();
            const quantityRaw = cleanNumber(fields[1] || '0');
            const avgCostRaw = cleanNumber(fields[3] || '0');
            const priceRaw = cleanNumber(fields[4] || '0');
            const marketValueRaw = cleanNumber(fields[6] || '0');
            
            // 跳过空行或垃圾数据
            if (!fundName || fundName.includes('\x00')) {
              i++;
              continue;
            }
            
            const quantity = new Decimal(quantityRaw);
            const avgCost = new Decimal(avgCostRaw);
            const price = new Decimal(priceRaw);
            const marketValue = new Decimal(marketValueRaw);
            
            // 基金：symbol = NFKC 标准化名称
            const normalizedName = normalizeFundName(fundName);
            
            sectionPositions.push({
              symbol: normalizedName,
              name: fundName, // 保留原始全角名
              quantity: quantity.toString(),
              avgCost: avgCost.toString(),
              price: price.toString(),
              accountName,
              assetClass: 'fund',
              unitBasis: '10000',
            });
            
            calculatedSubtotal = calculatedSubtotal.plus(marketValue);
          }
        } catch (error) {
          errors.push({
            row: i + 1,
            message: error instanceof Error ? error.message : '行解析失败',
          });
        }
        
        i++;
      }
      
      // 校验小计
      const fileSubtotalDecimal = new Decimal(fileSubtotal);
      const matchesFile = calculatedSubtotal.equals(fileSubtotalDecimal);
      
      if (!matchesFile) {
        const sectionLabel = assetClass === 'jp_stock' 
          ? `${custody.replace('預り', '')}（株式）`
          : `${custody.replace('預り', '')}（投信）`;
        errors.push({
          row: i + 1,
          message: `${sectionLabel}：明细合计 ¥${calculatedSubtotal.toFixed(0)}，文件小计 ¥${fileSubtotalDecimal.toFixed(0)}`,
        });
      }
      
      positions.push(...sectionPositions);
      
      // 查找或创建账户汇总
      let accountSummary = accountSummaries.find(s => s.accountName === accountName);
      if (!accountSummary) {
        accountSummary = {
          accountName,
          count: 0,
          totalValueJpy: '0',
          matchesFile: true,
        };
        accountSummaries.push(accountSummary);
      }
      
      accountSummary.count += sectionPositions.length;
      accountSummary.totalValueJpy = new Decimal(accountSummary.totalValueJpy)
        .plus(calculatedSubtotal)
        .toString();
      accountSummary.matchesFile = accountSummary.matchesFile && matchesFile;
      
    } else {
      i++;
    }
  }

  return { positions, errors, accountSummaries };
}
