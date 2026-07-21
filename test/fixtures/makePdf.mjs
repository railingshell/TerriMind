// test/fixtures/makePdf.mjs — минимальный генератор валидного текстового PDF (без зависимостей).
// Создаёт многостраничный PDF с заданными строками. Используется тестами извлечения правил.
import fs from 'node:fs';

function esc(s) { return s.replace(/([\\()])/g, '\\$1'); }

/**
 * @param {string[][]} pagesLines — массив страниц, каждая = массив строк текста
 * @returns {Buffer}
 */
export function makePdf(pagesLines) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  // 1: Catalog, 2: Pages, 3: Font
  const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = add('');            // placeholder, fill later
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageIds = [];
  const contentIds = [];
  for (const lines of pagesLines) {
    let stream = 'BT /F1 12 Tf 40 780 Td 16 TL\n';
    for (const line of lines) {
      stream += `(${esc(line)}) Tj T*\n`;
    }
    stream += 'ET';
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`;

  // Собираем файл с xref
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// CLI: node makePdf.mjs — генерирует фикстуры
if (process.argv[1] && process.argv[1].endsWith('makePdf.mjs')) {
  const path = await import('node:path');
  const url = await import('node:url');
  const dir = path.dirname(url.fileURLToPath(import.meta.url)) + path.sep;

  const pzz = makePdf([
    ['Land use and development rules', 'Territorial zone Zh-1', 'Building coverage not more than 0.4.', 'Floors from 5 to 12 floors.'],
    ['Greenery not less than 25 %.', 'Population density not more than 300 people/ha.', 'Floor area ratio not more than 2.5.']
  ]);
  fs.writeFileSync(dir + 'pzz.pdf', pzz);

  fs.writeFileSync(dir + 'notpdf.txt', 'this is not a pdf');

  console.log('fixtures written to', dir);
}
