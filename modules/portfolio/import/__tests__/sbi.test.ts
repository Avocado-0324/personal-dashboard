import { describe, it, expect } from '@jest/globals';
import { parseSBIHoldings, decodeShiftJIS, computeIdempotencyKey } from '../sbi';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

describe('SBI Holdings CSV Parser', () => {
  const fixtureUtf8 = fs.readFileSync(
    path.join(__dirname, 'fixtures/sbi-holdings-sample.csv'),
    'utf-8'
  );

  it('应该正确解析 CSV 格式', () => {
    const result = parseSBIHoldings(fixtureUtf8);
    
    expect(result.errors).toEqual([]);
    expect(result.positions.length).toBe(5);
    
    // 检查股票
    const toyota = result.positions.find(p => p.symbol === '7203');
    expect(toyota).toBeDefined();
    expect(toyota?.name).toBe('トヨタ自動車');
    expect(toyota?.quantity).toBe('100');
    expect(toyota?.price).toBe('2380');
    expect(toyota?.accountName).toBe('SBI 特定');
    expect(toyota?.assetClass).toBe('jp_stock');
    expect(toyota?.unitBasis).toBe('1');
    
    // 检查基金
    const emaxis = result.positions.find(p => p.name.includes('ｅＭＡＸＩＳ'));
    expect(emaxis).toBeDefined();
    expect(emaxis?.quantity).toBe('73367');
    expect(emaxis?.price).toBe('16857');
    expect(emaxis?.accountName).toBe('SBI 特定');
    expect(emaxis?.assetClass).toBe('fund');
    expect(emaxis?.unitBasis).toBe('10000');
  });

  it('应该正确映射账户名称', () => {
    const result = parseSBIHoldings(fixtureUtf8);
    
    const accounts = new Set(result.positions.map(p => p.accountName));
    expect(accounts.has('SBI 特定')).toBe(true);
    expect(accounts.has('SBI NISA成長')).toBe(true);
    expect(accounts.has('SBI NISAつみたて')).toBe(true);
  });

  it('应该生成账户汇总', () => {
    const result = parseSBIHoldings(fixtureUtf8);
    
    expect(result.accountSummaries.length).toBeGreaterThan(0);
    
    const tokutei = result.accountSummaries.find(s => s.accountName === 'SBI 特定');
    expect(tokutei).toBeDefined();
    expect(tokutei?.count).toBe(3); // 2 stocks + 1 fund
    expect(tokutei?.matchesFile).toBe(true);
    
    const nisaGrowth = result.accountSummaries.find(s => s.accountName === 'SBI NISA成長');
    expect(nisaGrowth).toBeDefined();
    expect(nisaGrowth?.count).toBe(1); // 1 stock
  });

  it('应该检测格式错误', () => {
    const badCsv = '这是不正确的 CSV\n一些其他内容';
    const result = parseSBIHoldings(badCsv);
    
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('SBI 保有証券一覧');
  });

  it('应该处理 Shift_JIS 编码', () => {
    // 将 UTF-8 转为 Shift_JIS
    const sjisBuffer = iconv.encode(fixtureUtf8, 'shift_jis');
    const decoded = decodeShiftJIS(sjisBuffer.buffer);
    
    // 解码后应该能正常解析
    const result = parseSBIHoldings(decoded);
    expect(result.errors).toEqual([]);
    expect(result.positions.length).toBe(5);
  });

  it('应该计算幂等性键', () => {
    const buffer = Buffer.from('test content');
    const asOf = '2024-10-05';
    
    const key1 = computeIdempotencyKey(buffer, asOf);
    const key2 = computeIdempotencyKey(buffer, asOf);
    
    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // SHA256 hex
  });

  it('应该清理数字格式（逗号、加号、口）', () => {
    const csv = `保有証券一覧

投資信託（金額/特定預り）合計

評価額合計,評価損益合計
"100,000","+50,000"

投資信託（金額/特定預り）

ファンド名,保有口数,売却注文中,取得単価,基準価額,取得金額,評価額,評価損益,分配金受取方法
"テストファンド","10000口","0","10,000","10,000","100,000","100,000","+0","再投資"
`;
    
    const result = parseSBIHoldings(csv);
    expect(result.errors).toEqual([]);
    expect(result.positions[0].quantity).toBe('10000');
  });

  it('应该处理嵌套括号的预り', () => {
    const csv = `保有証券一覧

株式（NISA預り（成長投資枠））合計

評価額合計,評価損益合計
"100,000","+0"

株式（NISA預り（成長投資枠））

銘柄コード,銘柄名称,保有株数,売却注文中,取得単価,現在値,取得金額,評価額,評価損益
"1234","テスト株式","100","0","1,000","1,000","100,000","100,000","+0"
`;
    
    const result = parseSBIHoldings(csv);
    expect(result.errors).toEqual([]);
    expect(result.positions[0].accountName).toBe('SBI NISA成長');
  });

  it('应该跳过文件开头的空行', () => {
    const fixtureEmptyFirstLine = fs.readFileSync(
      path.join(__dirname, 'fixtures/sbi-holdings-empty-first-line.csv'),
      'utf-8'
    );
    
    const result = parseSBIHoldings(fixtureEmptyFirstLine);
    expect(result.errors).toEqual([]);
    expect(result.positions.length).toBe(1);
    expect(result.positions[0].symbol).toBe('1234');
    expect(result.positions[0].accountName).toBe('SBI 特定');
  });
});
