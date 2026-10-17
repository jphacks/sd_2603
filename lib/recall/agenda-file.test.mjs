import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { downloadAgenda, driveDownloadUrl, parseAgendaFile } from './agenda-file.ts';

const link = 'https://drive.google.com/file/d/abcdefghijklm/view';
const docx = text => zipSync({ 'word/document.xml': strToU8(text) });
test('PDF extracts text with the bundled server PDF parser', async () => {
  const stream = 'BT /F1 12 Tf 40 200 Td (Agenda review) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  assert.equal(await parseAgendaFile(strToU8(pdf)), 'Agenda review');
});
test('DOCX extracts paragraph text and decodes XML without rendering', async () => {
  assert.equal(await parseAgendaFile(docx('<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>議題 &amp; Agenda</w:t></w:r></w:p><w:p><w:r><w:t>次の一歩</w:t></w:r></w:p></w:body></w:document>')), '議題 & Agenda\n次の一歩');
});
test('rejects unsafe, oversized, unsupported and empty documents', async () => {
  await assert.rejects(parseAgendaFile(docx('<!DOCTYPE x [<!ENTITY x "abc">]><x>&x;</x>')), /安全/);
  await assert.rejects(parseAgendaFile(docx('<w:t>' + 'a'.repeat(20001) + '</w:t>')), /20000/);
  await assert.rejects(parseAgendaFile(docx('a'.repeat(2 * 1024 * 1024 + 1))), /大きすぎ/);
  await assert.rejects(parseAgendaFile(strToU8('legacy doc')), /PDFとDOCX/);
  await assert.rejects(parseAgendaFile(docx('<w:document/>')), /抽出/);
});
test('Drive download rejects arbitrary hosts and unsafe redirect before fetching', async () => {
  assert.throws(() => driveDownloadUrl('https://localhost/file/d/abcdefghijklm'));
  let calls = 0;
  await assert.rejects(downloadAgenda(link, async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); }), /ダウンロード先/);
  assert.equal(calls, 1);
});
test('private Drive token is restricted to Google API and never forwarded', async () => {
  let calls = 0;
  const result = await downloadAgenda(link, async (url, options) => {
    if (calls++ === 0) {
      assert.equal(new URL(url).hostname, 'www.googleapis.com');
      assert.equal(options.headers.Authorization, 'Bearer test-only-token');
      return new Response(null, { status: 302, headers: { location: 'https://drive.usercontent.google.com/download' } });
    }
    assert.equal(options.headers.Authorization, undefined);
    return new Response('file');
  }, 'test-only-token');
  assert.equal(Buffer.from(result).toString(), 'file');
});
test('download caps size and explains private Drive permission errors', async () => {
  await assert.rejects(downloadAgenda(link, async () => new Response('x', { headers: { 'content-length': String(6 * 1024 * 1024) } })), /5MB/);
  await assert.rejects(downloadAgenda(link, async () => new Response('login', { headers: { 'content-type': 'text/html' } })), /Google認証/);
});
