import { BadRequestException } from '@nestjs/common';

/** ต้องตรงกับ IPrintLayout ของ frontend — หน่วย mm, ลำดับ elements = z-order */
export interface PrintLayout {
  version: 1;
  paper: {
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    marginMm: number;
  };
  background: { color: string; imageKey?: string; fit: PrintFit };
  elements: PrintElement[];
}

export type PrintFit = 'cover' | 'contain';

interface PrintBox {
  id: string;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export type PrintElement =
  | (PrintBox & {
      type: 'photo';
      fit: PrintFit;
      focusX: number;
      focusY: number;
    })
  | (PrintBox & { type: 'qr'; color: string; bgColor: string })
  | (PrintBox & { type: 'icon'; assetKey: string })
  | (PrintBox & {
      type: 'text';
      content: string;
      fontSizePt: number;
      color: string;
      weight: 400 | 500 | 700;
      align: 'left' | 'center' | 'right';
    })
  | { id: string; type: 'overlay'; assetKey: string };

const MAX_ELEMENTS = 50;
const MAX_TEXT_LENGTH = 500;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FITS: readonly PrintFit[] = ['cover', 'contain'];
const ELEMENT_TYPES: readonly PrintElement['type'][] = [
  'photo',
  'qr',
  'icon',
  'text',
  'overlay',
];

type Raw = Record<string, unknown>;

const fail = (path: string, rule: string): never => {
  throw new BadRequestException(`Invalid print layout: ${path} ${rule}`);
};

const obj = (value: unknown, path: string): Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : fail(path, 'must be an object');

const num = (value: unknown, path: string, min: number, max: number): number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? value
    : fail(path, `must be a number between ${min} and ${max}`);

const oneOf = <T>(value: unknown, path: string, allowed: readonly T[]): T =>
  allowed.includes(value as T)
    ? (value as T)
    : fail(path, `must be one of ${allowed.join(', ')}`);

const color = (value: unknown, path: string): string =>
  typeof value === 'string' && HEX_COLOR.test(value)
    ? value
    : fail(path, 'must be a #rrggbb color');

/**
 * แปลง JSON จาก client เป็น PrintLayout — ตัด field แปลกปลอมทิ้ง
 * asset key ต้องอยู่ใต้ `assetPrefix` ของ project นี้ ไม่งั้นจะ presign ไฟล์ของ org อื่นได้
 */
export const parsePrintLayout = (
  input: unknown,
  assetPrefix: string,
): PrintLayout => {
  const assetKey = (value: unknown, path: string): string =>
    typeof value === 'string' &&
    value.startsWith(assetPrefix) &&
    !value.includes('..')
      ? value
      : fail(path, 'must be an asset uploaded to this project');

  const root = obj(input, 'layout');
  if (root.version !== 1) fail('version', 'must be 1');

  const rawPaper = obj(root.paper, 'paper');
  const paper = {
    widthMm: num(rawPaper.widthMm, 'paper.widthMm', 20, 500),
    heightMm: num(rawPaper.heightMm, 'paper.heightMm', 20, 500),
    bleedMm: num(rawPaper.bleedMm, 'paper.bleedMm', 0, 10),
    marginMm: num(rawPaper.marginMm, 'paper.marginMm', 0, 50),
  };

  const rawBg = obj(root.background, 'background');
  const background: PrintLayout['background'] = {
    color: color(rawBg.color, 'background.color'),
    fit: oneOf(rawBg.fit, 'background.fit', FITS),
  };
  if (rawBg.imageKey !== undefined && rawBg.imageKey !== null) {
    background.imageKey = assetKey(rawBg.imageKey, 'background.imageKey');
  }

  if (!Array.isArray(root.elements)) fail('elements', 'must be an array');
  const rawElements = root.elements as unknown[];
  if (rawElements.length > MAX_ELEMENTS)
    fail('elements', `must have at most ${MAX_ELEMENTS} items`);

  const elements = rawElements.map((value, index): PrintElement => {
    const path = `elements[${index}]`;
    const raw = obj(value, path);
    const id =
      typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64
        ? raw.id
        : fail(`${path}.id`, 'must be a string of 1-64 characters');
    const type = oneOf(raw.type, `${path}.type`, ELEMENT_TYPES);
    if (type === 'overlay') {
      return {
        id,
        type: 'overlay',
        assetKey: assetKey(raw.assetKey, `${path}.assetKey`),
      };
    }
    const box: PrintBox = {
      id,
      xMm: num(raw.xMm, `${path}.xMm`, -paper.widthMm, paper.widthMm * 2),
      yMm: num(raw.yMm, `${path}.yMm`, -paper.heightMm, paper.heightMm * 2),
      wMm: num(raw.wMm, `${path}.wMm`, 1, paper.widthMm * 2),
      hMm: num(raw.hMm, `${path}.hMm`, 1, paper.heightMm * 2),
    };
    switch (type) {
      case 'photo':
        return {
          ...box,
          type: 'photo',
          fit: oneOf(raw.fit, `${path}.fit`, FITS),
          focusX: num(raw.focusX, `${path}.focusX`, 0, 100),
          focusY: num(raw.focusY, `${path}.focusY`, 0, 100),
        };
      case 'qr':
        return {
          ...box,
          type: 'qr',
          color: color(raw.color, `${path}.color`),
          bgColor: color(raw.bgColor, `${path}.bgColor`),
        };
      case 'icon':
        return {
          ...box,
          type: 'icon',
          assetKey: assetKey(raw.assetKey, `${path}.assetKey`),
        };
      case 'text':
        return {
          ...box,
          type: 'text',
          content:
            typeof raw.content === 'string' &&
            raw.content.length <= MAX_TEXT_LENGTH
              ? raw.content
              : fail(
                  `${path}.content`,
                  `must be a string of at most ${MAX_TEXT_LENGTH} characters`,
                ),
          fontSizePt: num(raw.fontSizePt, `${path}.fontSizePt`, 4, 200),
          color: color(raw.color, `${path}.color`),
          weight: oneOf(raw.weight, `${path}.weight`, [400, 500, 700] as const),
          align: oneOf(raw.align, `${path}.align`, [
            'left',
            'center',
            'right',
          ] as const),
        };
    }
  });

  return { version: 1, paper, background, elements };
};

/** storage key ทุกตัวที่ layout อ้างถึง — ใช้ presign ตอนส่งให้ frontend */
export const collectAssetKeys = (layout: PrintLayout): string[] => {
  const keys = layout.elements.flatMap((el) =>
    el.type === 'icon' || el.type === 'overlay' ? [el.assetKey] : [],
  );
  if (layout.background.imageKey) keys.push(layout.background.imageKey);
  return [...new Set(keys)];
};
