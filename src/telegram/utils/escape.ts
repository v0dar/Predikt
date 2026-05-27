// MarkdownV2 special characters that must be escaped outside code spans
const MD_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escMd(text: string | number | null | undefined): string {
  if (text == null) return '—';
  return String(text).replace(MD_SPECIAL, c => `\\${c}`);
}
