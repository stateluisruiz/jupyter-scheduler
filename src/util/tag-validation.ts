export const MAX_EMAIL_TAGS = 5;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function isEmailTag(tag: string): boolean {
  return EMAIL_RE.test(tag.trim());
}

export type TagFieldError = 'blank' | 'format';
export type TagListError = 'required' | 'max' | null;

export function emailTagErrors(
  tags: string[] | undefined,
  required: boolean
): { list: TagListError; fields: { [index: number]: TagFieldError } } {
  const list = tags ?? [];
  const fields: { [index: number]: TagFieldError } = {};

  list.forEach((tag, idx) => {
    const value = tag.trim();
    if (!value) {
      fields[idx] = 'blank';
    } else if (!isEmailTag(value)) {
      fields[idx] = 'format';
    }
  });

  if (list.length > MAX_EMAIL_TAGS) {
    return { list: 'max', fields };
  }

  const hasAddress = list.some(tag => tag.trim() !== '');
  if (required && !hasAddress) {
    return { list: 'required', fields };
  }

  return { list: null, fields };
}
